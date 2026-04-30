import * as vscode from "vscode";
import { v4 as uuid } from "uuid";
import OhMyHooksAuthenticationProvider from "./lib/OhMyHooksAuthenticationProvider";
import OhMyHooksWebViewProvider from "./lib/OhMyHooksWebViewProvider";
import { StateStore, type Status } from "./stateStore";
import { statusChanged, webhookPortResponse, webhookRequestsResponse, viewStateResponse, refreshRequestsForWebhook, webhookRequestReceived, webhookForwardResult } from "./messages";
import * as api from "./api";
import { WSClient } from "../../../shared/wsClient";
import { forward } from "../../../shared/forwarder";
import { RequestMessage } from "../../../shared/protocol";

// 3-20 lowercase alphanumerics; reject keys starting with the auto-id prefix
const CUSTOM_SUBDOMAIN_RE = /^[a-z0-9]{3,20}$/;
const CUSTOM_SUBDOMAIN_AUTO_PREFIX = "wh_";

const validateCustomSubdomainInput = (value: string): string | undefined => {
  if (!CUSTOM_SUBDOMAIN_RE.test(value)) {
    return "Subdomain must be 3-20 lowercase alphanumeric characters";
  }
  if (value.startsWith(CUSTOM_SUBDOMAIN_AUTO_PREFIX)) {
    return `Subdomain must not start with "${CUSTOM_SUBDOMAIN_AUTO_PREFIX}"`;
  }
  return undefined;
};

// 作成時の選択ダイアログ。Cancel した場合は undefined を返す。
// ephemeral webhook はこのダイアログでは扱わない (一覧の placeholder の Connect で発行される)。
const pickWebhookOptions = async (
  me: api.AccountMe,
): Promise<api.CreateWebhookOptions | undefined> => {
  const isPro = me.plan.customSubdomain && me.plan.limits.customUrl > 0;

  type Item = vscode.QuickPickItem & { value: 'persistent' | 'customUrl' };
  const items: Item[] = [
    {
      label: "Persistent webhook",
      description: `${me.plan.limits.persistent} slot(s) on ${me.plan.name}`,
      detail: "Indefinite lifetime, server-side history",
      value: 'persistent',
    },
    {
      label: isPro ? "Custom URL webhook" : "Custom URL webhook (Pro plan required)",
      description: isPro ? "1 slot on Pro" : "Custom URL requires the Pro plan",
      detail: "Pick your own subdomain (3-20 lowercase alphanumerics)",
      value: 'customUrl',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose webhook type",
    canPickMany: false,
  });
  if (!picked) {
    return undefined;
  }

  if (picked.value === 'customUrl') {
    if (!isPro) {
      vscode.window.showWarningMessage("Custom URL requires the Pro plan. Please upgrade to use this feature.");
      return undefined;
    }
    const subdomain = await vscode.window.showInputBox({
      prompt: "Custom subdomain (3-20 lowercase alphanumerics)",
      placeHolder: "myhook",
      validateInput: (v) => validateCustomSubdomainInput(v.trim()),
    });
    if (!subdomain) {
      return undefined;
    }
    return { type: 'persistent', customSubdomain: subdomain.trim() };
  }

  return { type: picked.value };
};

const handleCreateWebhookError = async (err: unknown): Promise<void> => {
  if (err instanceof api.CreateWebhookError) {
    if (err.status === 402) {
      const message = err.kind === 'customUrl'
        ? "You have reached your custom URL slot limit on this plan."
        : err.kind === 'persistent'
        ? "You have reached your persistent webhook limit on this plan."
        : err.kind === 'ephemeral'
        ? "You have reached your ephemeral webhook limit on this plan."
        : err.message || "Plan limit reached.";
      const action = await vscode.window.showErrorMessage(
        `Upgrade required: ${message} Please upgrade your plan to create more webhooks.`,
        "Upgrade Plan",
      );
      if (action === "Upgrade Plan") {
        const planUrl = `${process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787"}/settings/manage-plan`;
        vscode.env.openExternal(vscode.Uri.parse(planUrl));
      }
      return;
    }
    if (err.status === 400) {
      vscode.window.showErrorMessage(`Invalid input: ${err.message}`);
      return;
    }
    vscode.window.showErrorMessage(`Failed to create webhook: ${err.message}`);
    return;
  }
  vscode.window.showErrorMessage(
    `Failed to create webhook: ${err instanceof Error ? err.message : String(err)}`,
  );
};

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new OhMyHooksAuthenticationProvider(context));

  const stateStore = new StateStore(context);

  // session_id は extension activate 毎に生成 (永続化しない)。
  // 同じユーザでも別 VS Code window / 再起動毎に別 DO・別購読になる。
  const sessionId = uuid();

  let wsClient: WSClient | null = null;
  // Guest mode 用の独立した WS。webview の Connect で開始、Disconnect / Sign in / dispose で閉じる。
  let anonClient: WSClient | null = null;
  let anonForwardPort: number | null = null;

  const closeAnonClient = async () => {
    if (anonClient) {
      const c = anonClient;
      anonClient = null;
      anonForwardPort = null;
      await c.close();
    }
  };

  // 受信した request を webview に即時 push し、port があれば forward して結果を webview に通知する。
  // サーバには結果を返さない (一方向 WS)。
  const handleIncomingRequest = async (req: RequestMessage, port: number | null): Promise<void> => {
    if (provider) {
      provider.postMessage(JSON.stringify(webhookRequestReceived(req.webhookId, {
        id: req.sourceRequestId,
        webhookId: req.webhookId,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        createdAt: req.receivedAt,
      })));
    }

    if (port === null) {
      if (provider) {
        provider.postMessage(JSON.stringify(webhookForwardResult(req.webhookId, req.sourceRequestId, {
          status: null,
          error: "webhook is not connected on this client",
          durationMs: 0,
        })));
      }
      return;
    }

    const result = await forward(req, { port });
    if (provider) {
      provider.postMessage(JSON.stringify(webhookForwardResult(req.webhookId, req.sourceRequestId, {
        status: result.status,
        error: result.error,
        durationMs: result.durationMs,
      })));
    }
  };

  const onRequest = async (req: RequestMessage): Promise<void> => {
    const webhook = stateStore.getWebhookById(req.webhookId);
    const port = webhook && webhook.connection === "connected" ? webhook.localPort : null;
    await handleIncomingRequest(req, port);
  };

  const ensureWSClient = async (): Promise<WSClient | null> => {
    if (wsClient) {
      return wsClient;
    }
    const session = await stateStore.getSession();
    if (!session) {
      return null;
    }
    const misc = await stateStore.fetchMisc();
    if (!misc) {
      return null;
    }
    wsClient = new WSClient({
      wsUrl: misc.wsUrl,
      clientType: "vscode",
      sessionId,
      getAccessToken: async () => {
        const s = await stateStore.getSession();
        if (!s) {
          throw new Error("not authenticated");
        }
        return s.accessToken;
      },
      onRequest,
      onEphemeralWebhookCreated: (webhookId) => {
        const entry = stateStore.get().webhooks.find((w) => w.isEphemeral);
        const port = entry?.localPort ?? 0;
        stateStore.setEphemeralWebhookId(webhookId, port);
      },
    });
    wsClient.on("error", (err: Error) => {
      console.error("[wsClient] error:", err);
    });
    await wsClient.connect();
    return wsClient;
  };

  // Store webview state
  let viewState = {
    expandedWebhooks: [] as string[],
    requestsData: {} as Record<string, any[]>,
    selectedRequestModal: null as any
  };

  // Create provider early so it can be used in notification handler
  let provider: OhMyHooksWebViewProvider;

  const initialLoad = async () => {
    try {
      // 未認証だと fetchAll は静かに undefined を返すので、最後に必ず statusChanged を emit して
      // webview の loading 状態を解除する。
      await stateStore.refreshSession();
      await stateStore.fetchAll();
      await ensureWSClient();
      // 未認証で前回 guest mode を選んでいた場合は自動復元する
      const status = stateStore.get();
      if (!status.hasSession && !status.isGuestMode && stateStore.getGuestModePreference()) {
        stateStore.enterGuestMode();
        return;
      }
      stateStore.emitStatus();
    } catch (err) {
      if (err instanceof Error) {
        vscode.window.showErrorMessage(`Failed to setup: ${err.message}`);
      }
      // Ensure the UI shows sign-in button on error
      stateStore.clearSessionAndEmit();
    }
  };

  const messageHandler = async (message: any) => {
    try {
      switch (message.type) {
        case "initialLoad": {
          await initialLoad();
          break;
        }
        case "signIn": {
          // Guest mode 中の sign-in はサインイン成功までは guest UI を維持する。
          // forceSession より先に exitGuestMode を呼ぶと、OAuth 処理中に webview が
          // 初期 (Login / Use as Guest) 画面へ戻ってしまうため。
          const wasGuest = stateStore.get().isGuestMode;
          try {
            await stateStore.forceSession();
            // Sign-in 成功後に anon WS を閉じて guest mode を抜ける
            await closeAnonClient();
            if (wasGuest) {
              stateStore.exitGuestMode();
            }
            await initialLoad();
          } catch (err) {
            // Guest mode から開始した場合は guest UI に留まる。それ以外は sign-in 画面へ。
            if (!wasGuest) {
              stateStore.clearSessionAndEmit();
            }
            if (err instanceof Error) {
              vscode.window.showErrorMessage(`Sign in failed: ${err.message}`);
            }
          }
          break;
        }
        case "useAsGuest": {
          // 認証なしで Guest mode に入る。entry は 1 つだけ用意して webhook id は未払い出し状態。
          // Connect ボタンを押すと anon WS を開き、サーバが id を払い出して entry に入る。
          if (wsClient) {
            await wsClient.close();
            wsClient = null;
          }
          await closeAnonClient();
          stateStore.enterGuestMode();
          break;
        }
        case "exitGuest": {
          await closeAnonClient();
          stateStore.exitGuestMode();
          break;
        }
        case "connect": {
          const isGuest = stateStore.get().isGuestMode;

          if (isGuest) {
            // Guest: anon WS を開いて、サーバから払い出された webhook id を entry に書き込む。
            const port = Number(message.args.port);
            if (!Number.isFinite(port)) {
              vscode.window.showErrorMessage("Invalid port");
              return;
            }
            await closeAnonClient();
            anonForwardPort = port;
            stateStore.setGuestConnecting(port);

            const baseUrl = process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787";
            const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";
            const anonSessionId = uuid();
            anonClient = new WSClient({
              wsUrl,
              clientType: "vscode",
              sessionId: anonSessionId,
              anonymous: true,
              onRequest: async (req: RequestMessage): Promise<void> => {
                await handleIncomingRequest(req, anonForwardPort);
              },
              onAnonymousWebhookCreated: (webhookId) => {
                stateStore.setGuestWebhookId(webhookId, port);
              },
            });
            anonClient.on("error", (err: Error) => {
              console.error("[anonClient] error:", err);
            });
            anonClient.on("close", () => {
              // WS が閉じた = サーバ側で webhook 削除済み。entry の id をクリア。
              anonForwardPort = null;
              stateStore.clearGuestWebhookId();
            });
            try {
              await anonClient.connect();
            } catch (err) {
              await closeAnonClient();
              stateStore.clearGuestWebhookId();
              throw err;
            }
            break;
          }

          // Auth user: ephemeral placeholder の場合は subscribeEphemeral で id を要求
          const targetId: string = message.args.webhookId ?? "";
          const port = Number(message.args.port);
          if (!Number.isFinite(port)) {
            vscode.window.showErrorMessage("Invalid port");
            return;
          }
          // ephemeral placeholder (id "" または isEphemeral=true) の Connect
          const ephemeralEntry = stateStore.get().webhooks.find((w) => w.isEphemeral);
          if (ephemeralEntry && (targetId === "" || targetId === ephemeralEntry.id)) {
            stateStore.setEphemeralConnecting(port);
            try {
              const client = await ensureWSClient();
              if (!client) {
                throw new Error("not authenticated");
              }
              client.subscribeEphemeral();
              // setEphemeralWebhookId は onEphemeralWebhookCreated callback で呼ばれる
            } catch (err) {
              stateStore.clearEphemeralWebhookId();
              throw err;
            }
            break;
          }

          // 通常の persistent / customUrl webhook
          const webhook = stateStore.getWebhookById(targetId);
          if (!webhook) {
            vscode.window.showErrorMessage("Webhook not found");
            return;
          }
          await stateStore.connectWebhook(targetId, port);
          try {
            const client = await ensureWSClient();
            if (!client) {
              throw new Error("not authenticated");
            }
            client.subscribe(webhook.id);
            await stateStore.setWebhookConnected(targetId);
            if (viewState.expandedWebhooks.includes(targetId)) {
              provider.postMessage(JSON.stringify(refreshRequestsForWebhook(targetId)));
            }
          } catch (err) {
            await stateStore.disconnectWebhook(targetId);
            throw err;
          }
          break;
        }
        case "disconnect": {
          const isGuest = stateStore.get().isGuestMode;

          if (isGuest) {
            // Guest: 切断中スピナーを出してから WS を閉じる。state クリアは WSClient
            // の close イベント (clearGuestWebhookId) で行うので UI は実状態を追従する。
            stateStore.setGuestDisconnecting();
            await closeAnonClient();
            break;
          }

          const targetId: string = message.args.webhookId;
          // ephemeral placeholder の Disconnect: unsubscribe → サーバ側で削除 → placeholder クリア
          const ephemeralEntry = stateStore.get().webhooks.find((w) => w.isEphemeral);
          if (ephemeralEntry && targetId === ephemeralEntry.id && targetId !== "") {
            stateStore.setEphemeralDisconnecting();
            if (wsClient) {
              wsClient.unsubscribeEphemeral(targetId);
            }
            stateStore.clearEphemeralWebhookId();
            break;
          }

          const webhook = stateStore.getWebhookById(targetId);
          if (!webhook) {
            vscode.window.showErrorMessage("Webhook not found");
            return;
          }
          await stateStore.disconnectWebhook(targetId);
          if (wsClient) {
            wsClient.unsubscribe(webhook.id);
          }
          break;
        }
        case "getWebhookPort": {
          const port = stateStore.getWebhookPort(message.args.webhookId);
          const response = webhookPortResponse(message.args.webhookId, port);
          provider.postMessage(JSON.stringify(response));
          break;
        }
        case "getWebhookRequests": {
          try {
            const session = await stateStore.getSession();
            if (!session) {
              vscode.window.showErrorMessage("Not authenticated");
              return;
            }
            const requests = await api.getWebhookRequests(session, message.args.webhookId, 5);
            const response = webhookRequestsResponse(message.args.webhookId, requests);
            provider.postMessage(JSON.stringify(response));
          } catch (err) {
            const response = webhookRequestsResponse(message.args.webhookId, []);
            provider.postMessage(JSON.stringify(response));
            if (err instanceof Error) {
              vscode.window.showErrorMessage(`Failed to fetch requests: ${err.message}`);
            }
          }
          break;
        }
        case "getWebhookRequestDetail": {
          try {
            const session = await stateStore.getSession();
            if (!session) {
              vscode.window.showErrorMessage("Not authenticated");
              return;
            }
            const request = await api.getWebhookSourceRequest(session, message.args.webhookId, message.args.requestId);
            const response = {
              type: "webhookRequestDetailResponse",
              args: {
                requestId: message.args.requestId,
                request
              }
            };
            provider.postMessage(JSON.stringify(response));
          } catch (err) {
            const response = {
              type: "webhookRequestDetailResponse",
              args: {
                requestId: message.args.requestId,
                request: null
              }
            };
            provider.postMessage(JSON.stringify(response));
            if (err instanceof Error) {
              vscode.window.showErrorMessage(`Failed to fetch request details: ${err.message}`);
            }
          }
          break;
        }
        case "resendRequest": {
          try {
            // webview が body / headers 込みで request を渡してくる前提でそのまま forward に流す。
            // 認証ユーザは webview 側で getWebhookRequestDetail 経由で詰め直し、anon は WS push の値をそのまま使う。
            const webhook = stateStore.getWebhookById(message.args.webhookId);
            if (!webhook || webhook.connection !== "connected" || webhook.localPort === null) {
              vscode.window.showErrorMessage("Webhook is not connected");
              return;
            }
            const sourceRequest = message.args.request;
            if (!sourceRequest) {
              vscode.window.showErrorMessage("Request data is missing");
              return;
            }
            const reqMessage: RequestMessage = {
              type: "request",
              sourceRequestId: sourceRequest.id,
              webhookId: message.args.webhookId,
              method: sourceRequest.method,
              url: sourceRequest.url,
              headers: sourceRequest.headers,
              body: sourceRequest.body,
              receivedAt: sourceRequest.createdAt,
            };
            const result = await forward(reqMessage, { port: webhook.localPort });
            if (provider) {
              provider.postMessage(JSON.stringify(webhookForwardResult(message.args.webhookId, sourceRequest.id, {
                status: result.status,
                error: result.error,
                durationMs: result.durationMs,
              })));
            }
            if (result.error) {
              vscode.window.showErrorMessage(`Resend failed: ${result.error}`);
            } else {
              vscode.window.showInformationMessage(`Request resent (${result.status})`);
            }
          } catch (err) {
            if (err instanceof Error) {
              vscode.window.showErrorMessage(`Failed to resend request: ${err.message}`);
            }
          }
          break;
        }
        case "saveViewState": {
          viewState.expandedWebhooks = message.args.expandedWebhooks || [];
          viewState.requestsData = message.args.requestsData || {};
          viewState.selectedRequestModal = message.args.selectedRequestModal || null;
          break;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        vscode.window.showErrorMessage(`Error: ${err.message}`);
      }
    }
  };

  provider = new OhMyHooksWebViewProvider(context.extensionUri, messageHandler);
  stateStore.on("statusChanged", (status: Status) => {
    provider.postMessage(JSON.stringify(statusChanged(status)));
    // Also send view state after status update
    setTimeout(() => {
      provider.postMessage(JSON.stringify(viewStateResponse(viewState.expandedWebhooks, viewState.requestsData, viewState.selectedRequestModal)));
    }, 100);
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OhMyHooksWebViewProvider.viewType,
      provider
    )
  );

  // Register command for creating new webhook
  context.subscriptions.push(
    vscode.commands.registerCommand('oh-my-hooks.createWebhook', async () => {
      try {
        const session = await stateStore.getSession();
        if (!session) {
          vscode.window.showErrorMessage("Not authenticated");
          return;
        }

        // 現在のプランを取得 (custom URL の可否判定に必要)
        let me: api.AccountMe;
        try {
          me = await api.getMe(session);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to fetch plan info: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }

        const opts = await pickWebhookOptions(me);
        if (!opts) {
          return; // user cancelled
        }

        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Creating new webhook...",
          cancellable: false,
        }, async () => {
          try {
            await api.createWebhook(session, opts);
            vscode.window.showInformationMessage("New webhook created successfully");
            await stateStore.fetchWebhooks();
          } catch (err) {
            await handleCreateWebhookError(err);
          }
        });
      } catch (err) {
        if (err instanceof Error) {
          vscode.window.showErrorMessage(`Error: ${err.message}`);
        }
      }
    })
  );

  // Register command for opening settings
  context.subscriptions.push(
    vscode.commands.registerCommand('oh-my-hooks.openSettings', () => {
      const settingsUrl = `${process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787"}/settings`;
      vscode.env.openExternal(vscode.Uri.parse(settingsUrl));
    })
  );

  context.subscriptions.push(
    {
      dispose: () => {
        if (wsClient) {
          void wsClient.close();
        }
        if (anonClient) {
          void anonClient.close();
        }
      },
    },
    stateStore,
  );
}
