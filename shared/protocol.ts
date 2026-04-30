// WS protocol shared types between client and server.
// front 側の app/lib/ws_protocol.ts と内容を一致させる。

export type ClientType = 'vscode' | 'cli';

export type RequestMessage = {
  type: 'request';
  sourceRequestId: string;
  webhookId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  receivedAt: string;
};

export type AuthExpiredMessage = {
  type: 'auth_expired';
};

export type PongMessage = {
  type: 'pong';
};

// Anon: クライアントが subscribeAnonymous を送ると、サーバが新規 webhook を作成して
// id を返す。webhook のライフサイクルはこの WS 接続と同期 (close で消える)。
export type AnonymousWebhookCreatedMessage = {
  type: 'anonymousWebhookCreated';
  webhookId: string;
};

// Authed ephemeral: クライアントが subscribeEphemeral を送ると、サーバがそのユーザの
// ephemeral webhook を作成して id を返す。WS close または unsubscribe で削除される。
export type EphemeralWebhookCreatedMessage = {
  type: 'ephemeralWebhookCreated';
  webhookId: string;
};

export type ServerMessage =
  | RequestMessage
  | AuthExpiredMessage
  | PongMessage
  | AnonymousWebhookCreatedMessage
  | EphemeralWebhookCreatedMessage;

export type SubscribeMessage = {
  type: 'subscribe';
  webhookId: string;
};

export type UnsubscribeMessage = {
  type: 'unsubscribe';
  webhookId: string;
};

export type SubscribeAnonymousMessage = {
  type: 'subscribeAnonymous';
};

// Authed セッションが ephemeral webhook を作成・購読するためのメッセージ
export type SubscribeEphemeralMessage = {
  type: 'subscribeEphemeral';
};

export type PingMessage = {
  type: 'ping';
};

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | SubscribeAnonymousMessage
  | SubscribeEphemeralMessage
  | PingMessage;
