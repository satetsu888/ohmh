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

const handleCreateWebhookError = async (err: unknown): Promise<void> => {
  if (err instanceof api.CreateWebhookError) {
    if (err.status === 402) {
      const message = err.kind === 'persistent'
        ? "You have reached your persistent webhook limit on this plan."
        : err.kind === 'ephemeral'
        ? "You have reached your ephemeral webhook limit on this plan."
        : err.message || "Plan limit reached.";
      const action = await vscode.window.showErrorMessage(
        `Upgrade required: ${message} Please upgrade your plan to create more webhooks.`,
        "Upgrade Plan",
      );
      if (action === "Upgrade Plan") {
        const planUrl = `${process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787"}/settings`;
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

  // session_id is regenerated on every extension activate (never persisted), so each
  // VS Code window / restart gets its own Durable Object and subscription set,
  // even for the same user.
  const sessionId = uuid();

  let wsClient: WSClient | null = null;
  // Independent WS for guest mode. Opened by the webview's Connect, closed on
  // Disconnect / Sign in / dispose.
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

  // Push the received request to the webview immediately, then forward to the local
  // port (if any) and report the result back to the webview. The server is never
  // notified of the result; the WS protocol is one-way.
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

  let viewState = {
    expandedWebhooks: [] as string[],
    requestsData: {} as Record<string, any[]>,
    selectedRequestModal: null as any
  };

  // Declared early so the notification handler closure can reference it.
  let provider: OhMyHooksWebViewProvider;

  const initialLoad = async () => {
    try {
      // fetchAll silently returns undefined when unauthenticated, so always emit
      // statusChanged at the end to clear the webview's loading state.
      await stateStore.refreshSession();
      await stateStore.fetchAll();
      await ensureWSClient();
      // Auto-restore guest mode if the user previously chose it while unauthenticated.
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
          // While in guest mode, keep the guest UI visible until sign-in actually succeeds.
          // Calling exitGuestMode before forceSession would flip the webview back to the
          // initial (Login / Use as Guest) screen during OAuth.
          const wasGuest = stateStore.get().isGuestMode;
          try {
            await stateStore.forceSession();
            // After a successful sign-in, close the anon WS and leave guest mode.
            await closeAnonClient();
            if (wasGuest) {
              stateStore.exitGuestMode();
            }
            await initialLoad();
          } catch (err) {
            // If we started in guest mode, stay there; otherwise fall back to the sign-in screen.
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
          // Enter guest mode without authentication. A single placeholder entry is
          // created with no webhook id; clicking Connect opens the anon WS and the
          // server-issued id is written into the entry.
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
            // Guest: open the anon WS and record the server-issued webhook id into the entry.
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
              // WS closed = server already deleted the webhook. Clear the entry's id.
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

          // Authenticated user: request a fresh id via subscribeEphemeral when the
          // target is the ephemeral placeholder.
          const targetId: string = message.args.webhookId ?? "";
          const port = Number(message.args.port);
          if (!Number.isFinite(port)) {
            vscode.window.showErrorMessage("Invalid port");
            return;
          }
          // Connect on the ephemeral placeholder (id == "" or isEphemeral == true).
          const ephemeralEntry = stateStore.get().webhooks.find((w) => w.isEphemeral);
          if (ephemeralEntry && (targetId === "" || targetId === ephemeralEntry.id)) {
            stateStore.setEphemeralConnecting(port);
            try {
              const client = await ensureWSClient();
              if (!client) {
                throw new Error("not authenticated");
              }
              client.subscribeEphemeral();
              // setEphemeralWebhookId is invoked from the onEphemeralWebhookCreated callback.
            } catch (err) {
              stateStore.clearEphemeralWebhookId();
              throw err;
            }
            break;
          }

          // Normal persistent webhook.
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
            // Guest: show the disconnecting spinner first, then close the WS.
            // State is actually cleared from the WSClient close handler
            // (clearGuestWebhookId), so the UI tracks real state.
            stateStore.setGuestDisconnecting();
            await closeAnonClient();
            break;
          }

          const targetId: string = message.args.webhookId;
          // Disconnect on the ephemeral placeholder: unsubscribe → server deletes it → clear placeholder.
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
            // The webview hands us a request that already includes body and headers,
            // so we pass it straight to forward(). Authed users repopulate it via
            // getWebhookRequestDetail; anon uses the WS push payload directly.
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
    // Also send view state after the status update.
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

  context.subscriptions.push(
    vscode.commands.registerCommand('oh-my-hooks.createWebhook', async () => {
      try {
        const session = await stateStore.getSession();
        if (!session) {
          vscode.window.showErrorMessage("Not authenticated");
          return;
        }

        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Creating new webhook...",
          cancellable: false,
        }, async () => {
          try {
            await api.createWebhook(session, { type: 'persistent' });
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
