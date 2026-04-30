import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WSClient } from "./wsClient";
import type { ClientMessage, ServerMessage } from "./protocol";

// 最低限の WebSocket スタブ。globalThis.WebSocket と差し替えて wsClient の挙動を観察する。
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

  // テスト側から接続成功をシミュレート
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  // サーバ -> クライアントメッセージ送信
  fireMessage(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  fireClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  // wsClient.send が呼ぶ
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
      wsUrl: "ws://example.test/ws",
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
      wsUrl: "ws://example.test/ws",
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

    // 接続が落ちて再接続したとき、anonymousPending は false なので
    // subscribeAnonymous は送られない (古い id は破棄される設計どおり)
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
      wsUrl: "ws://example.test/ws",
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
      wsUrl: "ws://example.test/ws",
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

    // 切断 → 再接続
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();

    const resentIds = ws2.sent.filter((m) => m.type === "subscribe").map((m) => (m as any).webhookId);
    expect(resentIds.sort()).toEqual(["wh_a", "wh_b"]);
  });

  it("unsubscribe() removes from the replay set so reconnect does not re-subscribe", async () => {
    const client = new WSClient({
      wsUrl: "ws://example.test/ws",
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
      wsUrl: "ws://example.test/ws",
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

    // ephemeralPending は true のまま (再接続で別の id を再発行する設計)
    ws.fireClose();
    await vi.advanceTimersByTimeAsync(2000);
    const ws2 = MockWebSocket.last();
    ws2.fireOpen();
    expect(ws2.sent).toContainEqual({ type: "subscribeEphemeral" });
  });

  it("unsubscribeEphemeral cancels the pending flag and sends a regular unsubscribe", async () => {
    const client = new WSClient({
      wsUrl: "ws://example.test/ws",
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

    // 再接続後に subscribeEphemeral が再送されないこと
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
      wsUrl: "ws://example.test/ws",
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
    // microtask queue を進める
    await vi.advanceTimersByTimeAsync(0);

    expect(onRequest).toHaveBeenCalledTimes(1);
    // クライアントは response を返さない (片方向プロトコル)
    expect(ws.sent.find((m) => (m as any).type === "response")).toBeUndefined();
  });

  it("auth_expired triggers refreshAccessToken if provided and forces reconnect", async () => {
    const refresh = vi.fn(async () => "TKN2");
    const client = new WSClient({
      wsUrl: "ws://example.test/ws",
      clientType: "cli",
      sessionId: "sess-9",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN1",
      refreshAccessToken: refresh,
    });
    await client.connect();
    const ws = MockWebSocket.last();
    ws.fireOpen();

    ws.fireMessage({ type: "auth_expired" });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalled();
  });

  it("send() drops messages while disconnected; subscribe replays after reconnect", async () => {
    const client = new WSClient({
      wsUrl: "ws://example.test/ws",
      clientType: "cli",
      sessionId: "sess-10",
      onRequest: onRequestNoop,
      getAccessToken: async () => "TKN",
    });
    await client.connect();
    const ws = MockWebSocket.last();
    // open する前に subscribe を呼んでも socket は connecting 状態なので send は no-op
    client.subscribe("wh_x");
    expect(ws.sent).toEqual([]);

    ws.fireOpen();
    // open 時に subscriptions を再送する
    expect(ws.sent).toContainEqual({ type: "subscribe", webhookId: "wh_x" });
  });
});
