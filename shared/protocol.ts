// WS protocol shared types between client and server.
// Must be kept in sync with the server-side definition in app/lib/ws_protocol.ts.

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

// Anon: when the client sends subscribeAnonymous, the server creates a new webhook
// and returns its id. The webhook's lifecycle is tied to this WS connection
// (deleted on close).
export type AnonymousWebhookCreatedMessage = {
  type: 'anonymousWebhookCreated';
  webhookId: string;
};

// Authed ephemeral: when the client sends subscribeEphemeral, the server creates
// the user's ephemeral webhook and returns its id. Deleted on WS close or unsubscribe.
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
