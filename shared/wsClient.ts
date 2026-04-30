import { EventEmitter } from "events";
import {
  ClientMessage,
  ClientType,
  RequestMessage,
  ServerMessage,
} from "./protocol";

export type WSClientOptions = {
  wsUrl: string;
  // anonymous モードでは getAccessToken は呼ばれない
  getAccessToken?: () => Promise<string>;
  refreshAccessToken?: () => Promise<string>;
  clientType: ClientType;
  sessionId: string;
  // サーバから受け取った request をローカルで処理する (forward + UI 通知)。
  // 一方向プロトコルなので戻り値は不要。
  onRequest: (req: RequestMessage) => Promise<void>;
  // 再接続のバックオフ初期値 (ms)。デフォルト 1000
  initialReconnectDelayMs?: number;
  // 再接続のバックオフ上限 (ms)。デフォルト 30000
  maxReconnectDelayMs?: number;
  // ping 送信間隔 (ms)。デフォルト 25000
  pingIntervalMs?: number;
  // anonymous=true で接続する場合、認証無しの subprotocol を使い、
  // 接続後に subscribeAnonymous で webhook を発行してもらう。
  anonymous?: boolean;
  // anonymous モードで webhook が発行されたときに通知される。
  onAnonymousWebhookCreated?: (webhookId: string) => void;
  // authed ephemeral webhook が発行されたときに通知される。
  onEphemeralWebhookCreated?: (webhookId: string) => void;
};

type State = "idle" | "connecting" | "open" | "closing" | "closed";

// ServerMessage / ClientMessage を WS で送受する薄いクライアント。
// VS Code API には依存しない。
export class WSClient extends EventEmitter {
  private opts: WSClientOptions & {
    initialReconnectDelayMs: number;
    maxReconnectDelayMs: number;
    pingIntervalMs: number;
  };
  private ws: WebSocket | null = null;
  private state: State = "idle";
  private reconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  // 再接続後に subscribe を再送するために、購読中の webhookId を保持
  private subscriptions = new Set<string>();
  // anonymous モードで再接続時に subscribeAnonymous をやり直すフラグ
  private anonymousPending = false;
  // authed mode で再接続時に subscribeEphemeral をやり直すフラグ
  private ephemeralPending = false;
  // 意図的な close 中は再接続しない
  private intentionalClose = false;

  constructor(options: WSClientOptions) {
    super();
    if (!options.anonymous && !options.getAccessToken) {
      throw new Error("getAccessToken is required when not in anonymous mode");
    }
    this.opts = {
      initialReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      pingIntervalMs: 25000,
      ...options,
    };
    this.reconnectDelay = this.opts.initialReconnectDelayMs;
    if (options.anonymous) {
      this.anonymousPending = true;
    }
  }

  async connect(): Promise<void> {
    if (this.state === "open" || this.state === "connecting") {
      return;
    }
    this.intentionalClose = false;
    await this.openSocket();
  }

  subscribe(webhookId: string): void {
    this.subscriptions.add(webhookId);
    this.send({ type: "subscribe", webhookId });
  }

  unsubscribe(webhookId: string): void {
    this.subscriptions.delete(webhookId);
    this.send({ type: "unsubscribe", webhookId });
  }

  // authed ephemeral webhook を要求する。サーバが新規 webhook を作成し
  // ephemeralWebhookCreated を返す。
  subscribeEphemeral(): void {
    this.ephemeralPending = true;
    this.send({ type: "subscribeEphemeral" });
  }

  // ephemeral disconnect 用 helper: unsubscribe を送って pending フラグを下げる。
  // 既存の id は呼び出し側で管理。サーバ側は unsubscribe を受けて該当 ephemeral を削除する。
  unsubscribeEphemeral(webhookId: string): void {
    this.ephemeralPending = false;
    this.unsubscribe(webhookId);
  }

  async close(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.state = "closing";
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.state = "closed";
  }

  private send(message: ClientMessage): void {
    if (this.state !== "open" || !this.ws) {
      // 接続できていなければ破棄する。subscribe は subscriptions に保持済みなので
      // 再接続時に自動で再送される。
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      this.emit("error", err);
    }
  }

  private async openSocket(): Promise<void> {
    this.state = "connecting";
    let subprotocol: string;
    if (this.opts.anonymous) {
      subprotocol = "anonymous";
    } else {
      let token: string;
      try {
        token = await this.opts.getAccessToken!();
      } catch (err) {
        this.state = "closed";
        this.emit("error", err);
        this.scheduleReconnect();
        return;
      }
      subprotocol = `bearer.${token}`;
    }

    const url = new URL(this.opts.wsUrl);
    url.searchParams.set("session", this.opts.sessionId);
    url.searchParams.set("client", this.opts.clientType);

    let ws: WebSocket;
    try {
      // WebSocket は Node.js 22+ / VS Code 環境で global に存在する想定。
      // Bearer ヘッダはブラウザ標準 WebSocket では渡せないため、Sec-WebSocket-Protocol で送る。
      // anonymous モードでは "anonymous" subprotocol を使う。
      ws = new WebSocket(url.toString(), [subprotocol]);
    } catch (err) {
      this.state = "closed";
      this.emit("error", err);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      this.state = "open";
      this.reconnectDelay = this.opts.initialReconnectDelayMs;
      this.emit("open");
      if (this.opts.anonymous) {
        // anon: 接続のたびに新規 webhook を要求 (古い id は破棄される想定)
        if (this.anonymousPending) {
          this.send({ type: "subscribeAnonymous" });
        }
      } else {
        // 認証時は subscriptions を再送
        for (const webhookId of this.subscriptions) {
          this.send({ type: "subscribe", webhookId });
        }
        // ephemeral を要求していた場合は再要求 (新しい id が払い出される)
        if (this.ephemeralPending) {
          this.send({ type: "subscribeEphemeral" });
        }
      }
      this.startPing();
    };

    ws.onmessage = (event: MessageEvent) => {
      void this.handleMessage(event.data);
    };

    ws.onerror = (event: Event) => {
      this.emit("error", new Error("websocket error"));
      // onclose も発火するはずなので、ここでは reconnect を仕込まない
      void event;
    };

    ws.onclose = () => {
      this.stopPing();
      this.ws = null;
      const wasOpen = this.state === "open";
      this.state = "closed";
      this.emit("close");
      if (!this.intentionalClose) {
        if (wasOpen) {
          // 一度繋がっていた接続が切れたので即座に再接続を試みる
          this.reconnectDelay = this.opts.initialReconnectDelayMs;
        }
        this.scheduleReconnect();
      }
    };
  }

  private async handleMessage(raw: unknown): Promise<void> {
    let parsed: ServerMessage;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      parsed = JSON.parse(text) as ServerMessage;
    } catch (err) {
      this.emit("error", err);
      return;
    }

    switch (parsed.type) {
      case "request": {
        try {
          await this.opts.onRequest(parsed);
        } catch (err) {
          this.emit("error", err);
        }
        break;
      }
      case "auth_expired": {
        // refreshAccessToken があれば呼ぶ。無ければ単に再接続する
        try {
          if (this.opts.refreshAccessToken) {
            await this.opts.refreshAccessToken();
          }
        } catch (err) {
          this.emit("error", err);
        }
        // 既存接続を閉じて再接続
        if (this.ws) {
          try { this.ws.close(); } catch { /* ignore */ }
        }
        break;
      }
      case "anonymousWebhookCreated": {
        this.anonymousPending = false;
        if (this.opts.onAnonymousWebhookCreated) {
          this.opts.onAnonymousWebhookCreated(parsed.webhookId);
        }
        this.emit("anonymousWebhookCreated", parsed.webhookId);
        break;
      }
      case "ephemeralWebhookCreated": {
        // ephemeralPending はまだ true のまま (再接続時に再要求するため)
        if (this.opts.onEphemeralWebhookCreated) {
          this.opts.onEphemeralWebhookCreated(parsed.webhookId);
        }
        this.emit("ephemeralWebhookCreated", parsed.webhookId);
        break;
      }
      case "pong":
        break;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, this.opts.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.opts.maxReconnectDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }
}
