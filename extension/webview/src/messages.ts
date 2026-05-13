import { WebhookSourceRequest } from "../../core/src/api";

export type Message = {
    type: string;
    args?: { [key: string]: any };
}

export const InitialLoadMessage = {
  type: "initialLoad",
} as const satisfies Message;

export const SignInMessage = {
  type: "signIn",
} as const satisfies Message;

export const UseAsGuestMessage = {
  type: "useAsGuest",
} as const satisfies Message;

export const ConnectMessage = (webhookId: string, port: number): Message => {
  return {
    type: "connect",
    args: {
      port: port,
      webhookId: webhookId,
    },
  };
};

export const DisconnectMessage = (webhookId: string): Message => {
  return {
    type: "disconnect",
    args: {
      webhookId: webhookId,
    },
  };
};

export const GetWebhookPortMessage = (webhookId: string): Message => {
  return {
    type: "getWebhookPort",
    args: {
      webhookId: webhookId,
    },
  };
};

export const GetWebhookRequestsMessage = (webhookId: string): Message => {
  return {
    type: "getWebhookRequests",
    args: {
      webhookId: webhookId,
    },
  };
};

export const ResendRequestMessage = (webhookId: string, request: WebhookSourceRequest): Message => {
  return {
    type: "resendRequest",
    args: {
      webhookId: webhookId,
      request: request,
    },
  };
};

export const SaveViewStateMessage = (expandedWebhooks: string[], selectedRequestModal: {webhookId: string, request: any} | null): Message => {
  return {
    type: "saveViewState",
    args: {
      expandedWebhooks,
      selectedRequestModal,
    },
  };
};
