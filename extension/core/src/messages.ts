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

export const refreshAllExpandedWebhooks = (webhookIds: string[]): Message => {
  return {
    type: "refreshAllExpandedWebhooks",
    args: {
      webhookIds
    }
  };
};

// WS で受け取ったリクエストを webview のメモリに直接流し込むためのメッセージ。
// ephemeral / anon はサーバに履歴を持たないので必須、persistent でも届いた時点で
// 即時表示するために使う (refreshRequestsForWebhook より UX が良い)。
export const webhookRequestReceived = (webhookId: string, request: WebhookSourceRequest): Message => {
  return {
    type: "webhookRequestReceived",
    args: {
      webhookId,
      request,
    }
  };
};

// localhost への forward 結果。サーバには記録せず、webview のローカル状態にだけ反映する。
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

