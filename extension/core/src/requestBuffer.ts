import { WebhookSourceRequest } from "./api";
import { ForwardResultPayload } from "./messages";

const MAX_ROWS_PER_WEBHOOK = 5;

export class RequestBuffer {
  private requests: Record<string, WebhookSourceRequest[]> = {};
  private forwardResults: Record<string, ForwardResultPayload> = {};

  constructor(private onChange?: () => void) {}

  recordRequest(webhookId: string, request: WebhookSourceRequest): void {
    const existing = this.requests[webhookId] ?? [];
    const filtered = existing.filter((r) => r.id !== request.id);
    this.requests[webhookId] = [request, ...filtered].slice(
      0,
      MAX_ROWS_PER_WEBHOOK,
    );
    this.pruneForwardResults();
    this.onChange?.();
  }

  recordForwardResult(
    sourceRequestId: string,
    result: ForwardResultPayload,
  ): void {
    if (this.hasRequestId(sourceRequestId)) {
      this.forwardResults[sourceRequestId] = result;
      this.onChange?.();
    }
  }

  seedFromServer(
    webhookId: string,
    serverRequests: WebhookSourceRequest[],
  ): void {
    this.requests[webhookId] = serverRequests.slice(0, MAX_ROWS_PER_WEBHOOK);
    this.pruneForwardResults();
    this.onChange?.();
  }

  clearWebhook(webhookId: string): void {
    if (!(webhookId in this.requests)) return;
    delete this.requests[webhookId];
    this.pruneForwardResults();
    this.onChange?.();
  }

  clearAll(): void {
    this.requests = {};
    this.forwardResults = {};
    this.onChange?.();
  }

  snapshot(): {
    requests: Record<string, WebhookSourceRequest[]>;
    forwardResults: Record<string, ForwardResultPayload>;
  } {
    return { requests: this.requests, forwardResults: this.forwardResults };
  }

  private hasRequestId(id: string): boolean {
    for (const list of Object.values(this.requests)) {
      if (list.some((r) => r.id === id)) return true;
    }
    return false;
  }

  private pruneForwardResults(): void {
    const valid = new Set<string>();
    for (const list of Object.values(this.requests)) {
      for (const r of list) valid.add(r.id);
    }
    for (const id of Object.keys(this.forwardResults)) {
      if (!valid.has(id)) delete this.forwardResults[id];
    }
  }
}
