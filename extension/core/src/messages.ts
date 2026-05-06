import { Status } from "./stateStore";
import { WebhookSourceRequest } from "./api";

export type Message = {
    type: string;
    args?: { [key: string]: any };
}

export const statusChanged = (status: Status): Message => {
  return {
    type: "statusChanged",
    args: status,
  };
};

export const webhookPortResponse = (webhookId: string, port: number | null): Message => {
  return {
    type: "webhookPortResponse",
    args: {
      webhookId,
      port
    }
  };
};

export const webhookRequestsResponse = (webhookId: string, requests: any[]): Message => {
  return {
    type: "webhookRequestsResponse",
    args: {
      webhookId,
      requests
    }
  };
};

export const viewStateResponse = (expandedWebhooks: string[], requestsData: Record<string, any[]>, selectedRequestModal?: any): Message => {
  return {
    type: "viewStateResponse",
    args: {
      expandedWebhooks,
      requestsData,
      selectedRequestModal
    }
  };
};

export const refreshRequestsForWebhook = (webhookId: string): Message => {
  return {
    type: "refreshRequestsForWebhook",
    args: {
      webhookId
    }
  };
};

// Pushes a WS-delivered request straight into the webview's in-memory state.
// Required for ephemeral / anon (the server has no history for them); used for
// persistent too so the row appears immediately (better UX than refreshRequestsForWebhook).
export const webhookRequestReceived = (webhookId: string, request: WebhookSourceRequest): Message => {
  return {
    type: "webhookRequestReceived",
    args: {
      webhookId,
      request,
    }
  };
};

// Result of forwarding to localhost. Never persisted on the server; reflected only in the webview's local state.
export type ForwardResultPayload = {
  status: number | null;
  error: string | null;
  durationMs: number;
};

export const webhookForwardResult = (
  webhookId: string,
  sourceRequestId: string,
  result: ForwardResultPayload,
): Message => {
  return {
    type: "webhookForwardResult",
    args: {
      webhookId,
      sourceRequestId,
      result,
    }
  };
};

