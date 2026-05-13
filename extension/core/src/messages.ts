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

export const viewStateResponse = (
  expandedWebhooks: string[],
  requestsData: Record<string, WebhookSourceRequest[]>,
  forwardResults: Record<string, ForwardResultPayload>,
  selectedRequestModal?: any,
): Message => ({
  type: "viewStateResponse",
  args: { expandedWebhooks, requestsData, forwardResults, selectedRequestModal },
});

export const webhookRequestsFetched = (webhookId: string): Message => ({
  type: "webhookRequestsFetched",
  args: { webhookId },
});

export type ForwardResultPayload = {
  status: number | null;
  error: string | null;
  durationMs: number;
};

