import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WSClient } from "./wsClient";
import type { ClientMessage, ServerMessage } from "./protocol";

// Minimal WebSocket stub. Swapped into globalThis.WebSocket to observe wsClient behavior.
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string | string[] | undefined;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: ClientMessage[] = [];
  closed = false;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  fireMessage(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  fireClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as ClientMessage);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.fireClose();
  }

  static last(): MockWebSocket {
    const ws = MockWebSocket.instances.at(-1);
    if (!ws) {
      throw new Error("no MockWebSocket created");
    }
    return ws;
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

let originalWebSocket: typeof globalThis.WebSocket | undefined;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  // @ts-expect-error - replace global with mock
  globalThis.WebSocket = MockWebSocket;
  MockWebSocket.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  if (originalWebSocket) {
    globalThis.WebSocket = originalWebSocket;
  } else {
    // @ts-expect-error
    delete globalThis.WebSocket;
  }
  vi.useRealTimers();
});

const onRequestNoop = async () => {
  /* noop */
};

describe("WSClient (anonymous)", () => {
  it("attaches the 'anonymous' subprotocol and auto-sends subscribeAnonymous on open", async () => {
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-1",
      anonymous: true,
      onRequest: onRequestNoop,
    });
    await client.connect();
    const ws = MockWebSocket.last();
    expect(ws.protocols).toEqual(["anonymous"]);
    expect(ws.url).toContain("session=sess-1");
    expect(ws.url).toContain("client=cli");

    ws.fireOpen();
    expect(ws.sent[0]).toEqual({ type: "subscribeAnonymous" });
  });

  it("notifies onAnonymousWebhookCreated and clears anonymousPending so reconnect does not re-create", async () => {
    const onCreated = vi.fn();
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-2",
      anonymous: true,
      onRequest: onRequestNoop,
      onAnonymousWebhookCreated: onCreated,
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();
    ws.fireMessage({ type: "anonymousWebhookCreated", webhookId: "wh_anon" });

    expect(onCreated).toHaveBeenCalledWith("wh_anon");

    // After a drop+reconnect, anonymousPending is false so subscribeAnonymous
    // is not re-sent (the old id is discarded by design).
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    expect(ws2).not.toBe(ws);
    ws2.fireOpen();
    expect(ws2.sent).toEqual([]);
  });
});

describe("WSClient (authed)", () => {
  it("attaches bearer.<token> subprotocol via getAccessToken", async () => {
    const getAccessToken = vi.fn(async () => "TKN");
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "vscode",
      sessionId: "sess-3",
      onRequest: onRequestNoop,
      getAccessToken,
    });
    await client.connect();
    const ws = MockWebSocket.last();
    expect(getAccessToken).toHaveBeenCalled();
    expect(ws.protocols).toEqual(["bearer.TKN"]);
  });

  it("subscribe() resends every active subscription on reconnect", async () => {
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-4",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    client.subscribe("wh_a");
    client.subscribe("wh_b");
    expect(ws.sent.filter((m) => m.type === "subscribe")).toHaveLength(2);

    // Drop + reconnect.
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();

    const resentIds = ws2.sent.filter((m) => m.type === "subscribe").map((m) => (m as any).webhookId);
    expect(resentIds.sort()).toEqual(["wh_a", "wh_b"]);
  });

  it("unsubscribe() removes from the replay set so reconnect does not re-subscribe", async () => {
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-5",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    client.subscribe("wh_a");
    client.unsubscribe("wh_a");

    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();

    const resent = ws2.sent.filter((m) => m.type === "subscribe");
    expect(resent).toEqual([]);
  });

  it("subscribeEphemeral keeps ephemeralPending=true so reconnect re-requests a fresh ephemeral id", async () => {
    const onEphemeral = vi.fn();
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-6",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
      onEphemeralWebhookCreated: onEphemeral,
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    client.subscribeEphemeral();
    expect(ws.sent).toContainEqual({ type: "subscribeEphemeral" });
    ws.fireMessage({ type: "ephemeralWebhookCreated", webhookId: "wh_eph_1" });
    expect(onEphemeral).toHaveBeenCalledWith("wh_eph_1");

    // ephemeralPending stays true so reconnect re-issues a fresh id.
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();
    expect(ws2.sent).toContainEqual({ type: "subscribeEphemeral" });
  });

  it("unsubscribeEphemeral cancels the pending flag and sends a regular unsubscribe", async () => {
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-7",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    client.subscribeEphemeral();
    ws.fireMessage({ type: "ephemeralWebhookCreated", webhookId: "wh_eph" });
    client.unsubscribeEphemeral("wh_eph");

    expect(ws.sent.filter((m) => m.type === "unsubscribe")).toEqual([
      { type: "unsubscribe", webhookId: "wh_eph" },
    ]);

    // subscribeEphemeral must not be re-sent after reconnect.
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();
    expect(ws2.sent.filter((m) => m.type === "subscribeEphemeral")).toEqual([]);
  });

  it("invokes onRequest when the server pushes a 'request' message (one-way protocol; no echo back)", async () => {
    const onRequest = vi.fn(async () => {
      /* noop */
    });
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-8",
      onRequest,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    ws.fireMessage({
      type: "request",
      sourceRequestId: "src",
      webhookId: "wh",
      method: "POST",
      url: "/x",
      headers: {},
      body: null,
      receivedAt: new Date(0).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(onRequest).toHaveBeenCalledTimes(1);
    // The client never echoes a response back (one-way protocol).
    expect(ws.sent.find((m) => (m as any).type === "response")).toBeUndefined();
  });

  it("send() drops messages while disconnected; subscribe replays after reconnect", async () => {
    const client = new WSClient({
      wsUrl: "wss://example.test/ws",
      clientType: "cli",
      sessionId: "sess-10",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    // Calling subscribe before open is a no-op since the socket is still connecting.
    client.subscribe("wh_x");
    expect(ws.sent).toEqual([]);

    ws.fireOpen();
    // Subscriptions are replayed on open.
    expect(ws.sent).toContainEqual({ type: "subscribe", webhookId: "wh_x" });
  });
});

describe("WSClient (url scheme guards)", () => {
  it("refuses ws:// against a non-loopback hostname (would leak bearer in plaintext)", async () => {
    const errors: unknown[] = [];
    const client = new WSClient({
      wsUrl: "ws://example.test/ws",
      clientType: "cli",
      sessionId: "sess-guard",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    client.on("error", (err) => errors.push(err));
    await client.connect();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toMatch(/non-loopback host/);
  });

  it("allows ws:// against localhost (local dev)", async () => {
    const client = new WSClient({
      wsUrl: "ws://localhost:8787/ws",
      clientType: "cli",
      sessionId: "sess-local",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("rejects unsupported schemes like http://", async () => {
    const errors: unknown[] = [];
    const client = new WSClient({
      wsUrl: "http://example.test/ws",
      clientType: "cli",
      sessionId: "sess-bad",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    client.on("error", (err) => errors.push(err));
    await client.connect();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toMatch(/unsupported ws url scheme/);
  });
});
