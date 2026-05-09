import { EventEmitter } from "events";
import {
  ClientMessage,
  ClientType,
  RequestMessage,
  ServerMessage,
} from "./protocol";

export type WSClientOptions = {
  wsUrl: string;
  // Not called in anonymous mode.
  getAccessToken?: () => Promise<string>;
  clientType: ClientType;
  sessionId: string;
  // Locally handle a request received from the server (forward + UI notification).
  // The protocol is one-way, so no response is sent back.
  onRequest: (req: RequestMessage) => Promise<void>;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  pingIntervalMs?: number;
  // When true, connect with the unauthenticated subprotocol and request a webhook
  // via subscribeAnonymous after the connection opens.
  anonymous?: boolean;
  onAnonymousWebhookCreated?: (webhookId: string) => void;
  onEphemeralWebhookCreated?: (webhookId: string) => void;
};

type State = "idle" | "connecting" | "open" | "closing" | "closed";

const isLoopbackHostname = (hostname: string): boolean => {
  // URL parses [::1] hostnames as "::1" without brackets.
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
};

// Thin WebSocket client that sends/receives ServerMessage / ClientMessage.
// Has no dependency on the VS Code API.
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
  // Tracks webhookIds we're subscribed to so we can re-send subscribe on reconnect.
  private subscriptions = new Set<string>();
  // True when subscribeAnonymous needs to be re-sent on reconnect.
  private anonymousPending = false;
  // True when subscribeEphemeral needs to be re-sent on reconnect.
  private ephemeralPending = false;
  // Skip auto-reconnect while we're closing on purpose.
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

  // Request an authed ephemeral webhook. The server creates a new webhook and
  // responds with ephemeralWebhookCreated.
  subscribeEphemeral(): void {
    this.ephemeralPending = true;
    this.send({ type: "subscribeEphemeral" });
  }

  // Helper for ephemeral disconnect: send unsubscribe and clear the pending flag.
  // The caller owns the existing id; the server deletes the ephemeral webhook on unsubscribe.
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
      // Drop the message when not connected. subscribe state is held in
      // `subscriptions` and will be re-sent automatically on reconnect.
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

    let url: URL;
    try {
      url = new URL(this.opts.wsUrl);
    } catch (err) {
      this.intentionalClose = true;
      this.state = "closed";
      this.emit("error", err);
      return;
    }
    // Refuse to send the bearer token over plaintext ws:// against a non-loopback
    // host. wss:// is required in production; ws:// is only allowed for local dev
    // (localhost / 127.0.0.1 / ::1).
    if (url.protocol !== "wss:" && url.protocol !== "ws:") {
      this.intentionalClose = true;
      this.state = "closed";
      this.emit("error", new Error(`unsupported ws url scheme: ${url.protocol}`));
      return;
    }
    if (url.protocol === "ws:" && !isLoopbackHostname(url.hostname)) {
      this.intentionalClose = true;
      this.state = "closed";
      this.emit(
        "error",
        new Error(`refusing to use plaintext ws:// against non-loopback host ${url.hostname}; use wss://`),
      );
      return;
    }
    url.searchParams.set("session", this.opts.sessionId);
    url.searchParams.set("client", this.opts.clientType);

    let ws: WebSocket;
    try {
      // WebSocket is expected to be a global on Node.js 22+ and inside VS Code.
      // The browser WebSocket API cannot send custom headers, so the bearer token
      // is transmitted via Sec-WebSocket-Protocol. Anonymous mode uses the
      // "anonymous" subprotocol instead.
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
        // Anon: request a fresh webhook on every connect; the previous id is discarded.
        if (this.anonymousPending) {
          this.send({ type: "subscribeAnonymous" });
        }
      } else {
        // Authed: replay all current subscriptions.
        for (const webhookId of this.subscriptions) {
          this.send({ type: "subscribe", webhookId });
        }
        // Re-request the ephemeral webhook if one was previously active (a new id is issued).
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
      // onclose is expected to fire as well, so reconnect is scheduled there.
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
          // We had a live connection that just dropped; reset backoff to retry quickly.
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
      case "anonymousWebhookCreated": {
        this.anonymousPending = false;
        if (this.opts.onAnonymousWebhookCreated) {
          this.opts.onAnonymousWebhookCreated(parsed.webhookId);
        }
        this.emit("anonymousWebhookCreated", parsed.webhookId);
        break;
      }
      case "ephemeralWebhookCreated": {
        // Leave ephemeralPending=true so we re-request on reconnect.
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
