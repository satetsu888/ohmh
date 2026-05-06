// JSON Schema for the NDJSON events emitted under --json mode.
// Printed to stdout by `ohmh schema` so machine-readable consumers can
// validate or generate types from it without scraping README/SKILL docs.

const NDJSON_EVENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ohmh.satetsu888.dev/schemas/ndjson-event.v1.json",
  title: "ohmh CLI NDJSON event",
  description:
    "One JSON object per line on stdout when `--json` is passed. Consumers should ignore unknown `type` values for forward compatibility.",
  oneOf: [
    { $ref: "#/$defs/ready" },
    { $ref: "#/$defs/connectRequest" },
    { $ref: "#/$defs/error" },
    { $ref: "#/$defs/loginUrl" },
    { $ref: "#/$defs/login" },
    { $ref: "#/$defs/logout" },
    { $ref: "#/$defs/whoami" },
    { $ref: "#/$defs/list" },
    { $ref: "#/$defs/create" },
    { $ref: "#/$defs/delete" },
    { $ref: "#/$defs/requests" },
    { $ref: "#/$defs/requestDetail" },
    { $ref: "#/$defs/resend" },
  ],
  $defs: {
    Webhook: {
      type: "object",
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
        destinationUrls: { type: "array", items: { type: "string" } },
        expiresAt: { type: ["string", "null"] },
        createdAt: { type: "string" },
      },
      required: ["id"],
    },
    WebhookSourceRequest: {
      type: "object",
      properties: {
        id: { type: "string" },
        webhookId: { type: "string" },
        method: { type: "string" },
        url: { type: "string" },
        createdAt: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: ["string", "null"] },
      },
      required: ["id", "webhookId", "method", "url", "createdAt", "headers", "body"],
    },
    PlanInfo: {
      type: "object",
      properties: {
        key: { type: "string" },
        name: { type: "string" },
        limits: {
          type: "object",
          properties: {
            ephemeral: { type: "number" },
            persistent: { type: "number" },
            requestsPerDay: { type: "number" },
            historyDays: { type: "number" },
          },
          required: ["ephemeral", "persistent", "requestsPerDay", "historyDays"],
        },
      },
      required: ["key", "name", "limits"],
    },
    ready: {
      title: "ready (connect)",
      description:
        "Emitted once when the WebSocket is connected and the webhook id is known.",
      type: "object",
      properties: {
        type: { const: "ready" },
        mode: { enum: ["anonymous", "ephemeral", "persistent"] },
        webhookId: { type: "string" },
        url: { type: "string", format: "uri" },
        forwardPort: { type: "integer", minimum: 1, maximum: 65535 },
      },
      required: ["type", "mode", "webhookId", "url", "forwardPort"],
    },
    connectRequest: {
      title: "request (connect, per arrival)",
      description:
        "Emitted for every webhook arrival forwarded by `connect`. Distinct from the `request` event emitted by `ohmh request <id> <reqId>` (which wraps a full request body).",
      type: "object",
      properties: {
        type: { const: "request" },
        ts: { type: "string", format: "date-time" },
        sourceRequestId: { type: "string" },
        webhookId: { type: "string" },
        method: { type: "string" },
        path: { type: "string" },
        status: { type: ["integer", "null"] },
        durationMs: { type: "number" },
        error: { type: "string" },
      },
      required: ["type", "ts", "sourceRequestId", "webhookId", "method", "path", "status", "durationMs"],
    },
    requestDetail: {
      title: "request (single detail, from `ohmh request`)",
      description:
        "Emitted by `ohmh request <id> <reqId> --json`. Has a nested `request` object — distinguishable from the per-arrival event by that field.",
      type: "object",
      properties: {
        type: { const: "request" },
        request: { $ref: "#/$defs/WebhookSourceRequest" },
      },
      required: ["type", "request"],
    },
    error: {
      title: "error (any subcommand)",
      description: "Emitted before non-zero exit. Consumers branch on `code`.",
      type: "object",
      properties: {
        type: { const: "error" },
        code: {
          enum: [
            "general_error",
            "auth_required",
            "state_mismatch",
            "plan_limit",
            "plan_limit_upgradable",
            "plan_limit_top",
            "not_found",
            "bad_input",
            "ephemeral_via_ws_only",
            "forward_failed",
          ],
        },
        exitCode: { type: "integer", minimum: 1, maximum: 5 },
        message: { type: "string" },
        name: { type: "string" },
        kind: { enum: ["ephemeral", "persistent"] },
        reason: { type: "string" },
        webhookLimit: { type: "integer", minimum: 0 },
        status: { type: "integer" },
      },
      required: ["type", "code", "exitCode", "message", "name"],
    },
    loginUrl: {
      title: "login_url (login)",
      description: "Emitted before the browser is opened, so headless agents can pass the URL to a human.",
      type: "object",
      properties: {
        type: { const: "login_url" },
        url: { type: "string", format: "uri" },
        redirectUri: { type: "string", format: "uri" },
      },
      required: ["type", "url", "redirectUri"],
    },
    login: {
      title: "login (final, login)",
      type: "object",
      properties: {
        type: { const: "login" },
        baseUrl: { type: "string", format: "uri" },
        name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        plan: { type: ["string", "null"] },
      },
      required: ["type", "baseUrl"],
    },
    logout: {
      title: "logout",
      type: "object",
      properties: {
        type: { const: "logout" },
        baseUrl: { type: "string", format: "uri" },
      },
      required: ["type", "baseUrl"],
    },
    whoami: {
      title: "whoami",
      type: "object",
      properties: {
        type: { const: "whoami" },
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        image: { type: ["string", "null"] },
        plan: { $ref: "#/$defs/PlanInfo" },
      },
      required: ["type", "id", "name", "email", "plan"],
    },
    list: {
      title: "list",
      type: "object",
      properties: {
        type: { const: "list" },
        webhooks: { type: "array", items: { $ref: "#/$defs/Webhook" } },
      },
      required: ["type", "webhooks"],
    },
    create: {
      title: "create",
      type: "object",
      properties: {
        type: { const: "create" },
        webhook: { $ref: "#/$defs/Webhook" },
      },
      required: ["type", "webhook"],
    },
    delete: {
      title: "delete",
      type: "object",
      properties: {
        type: { const: "delete" },
        webhookId: { type: "string" },
        deleted: { type: "boolean" },
      },
      required: ["type", "webhookId", "deleted"],
    },
    requests: {
      title: "requests (list)",
      type: "object",
      properties: {
        type: { const: "requests" },
        webhookId: { type: "string" },
        requests: { type: "array", items: { $ref: "#/$defs/WebhookSourceRequest" } },
      },
      required: ["type", "webhookId", "requests"],
    },
    resend: {
      title: "resend",
      type: "object",
      properties: {
        type: { const: "resend" },
        webhookId: { type: "string" },
        requestId: { type: "string" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        status: { type: ["integer", "null"] },
        durationMs: { type: "number" },
        error: { type: "string" },
      },
      required: ["type", "webhookId", "requestId", "port", "status", "durationMs"],
    },
  },
};

export const schemaCommand = (): void => {
  // Always plain stdout — the schema is the entire output, not an event.
  process.stdout.write(JSON.stringify(NDJSON_EVENT_SCHEMA, null, 2) + "\n");
};

// Exported for tests.
export const __schema = NDJSON_EVENT_SCHEMA;
