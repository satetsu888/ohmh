import { CreateWebhookError, createWebhook } from "../api";
import { buildWebhookUrl } from "../config";
import { CliError, EXIT_BAD_INPUT, EXIT_PLAN_LIMIT, ErrorCode } from "../errors";
import { requireSession } from "../session/currentSession";
import { emitJsonEvent, info, isJsonMode, success } from "../ui/logger";

export type CreateOptions = {
  baseUrlOverride?: string;
};

class PlanLimitError extends CliError {
  readonly kind?: string;
  readonly reason?: string;
  readonly webhookLimit?: number;
  readonly status: number;

  constructor(
    message: string,
    code: ErrorCode,
    opts: { kind?: string; reason?: string; webhookLimit?: number; status: number },
  ) {
    super(message, EXIT_PLAN_LIMIT, code);
    this.kind = opts.kind;
    this.reason = opts.reason;
    this.webhookLimit = opts.webhookLimit;
    this.status = opts.status;
  }
}

const handleCreateError = (err: unknown, planUrl: string): never => {
  if (err instanceof CreateWebhookError) {
    if (err.status === 402) {
      // Differentiate by webhookLimit so AI/users get an actionable next step:
      //   limit === 0  → user is on Free, can upgrade to Metered
      //   limit  >= 1  → already on the top plan, must delete an existing webhook
      const onTopPlan = typeof err.webhookLimit === "number" && err.webhookLimit >= 1;
      if (onTopPlan) {
        throw new PlanLimitError(
          `${err.kind ?? "Webhook"} limit reached on your current plan (${err.webhookLimit}). Delete an unused webhook with \`ohmh delete <id> --yes\`.`,
          "plan_limit_top",
          { kind: err.kind, reason: err.reason, webhookLimit: err.webhookLimit, status: err.status },
        );
      }
      throw new PlanLimitError(
        `${err.kind ?? "Webhook"} limit reached. Upgrade to Metered: ${planUrl}`,
        "plan_limit_upgradable",
        { kind: err.kind, reason: err.reason, webhookLimit: err.webhookLimit, status: err.status },
      );
    }
    if (err.status === 400) {
      throw new CliError(`invalid input: ${err.message}`, EXIT_BAD_INPUT, "bad_input");
    }
    throw new CliError(`failed to create webhook: ${err.message}`);
  }
  throw err;
};

export const createCommand = async (opts: CreateOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);
  const planUrl = `${session.baseUrl}/settings`;

  try {
    const created = await createWebhook(session.baseUrl, session.token, {
      type: "persistent",
    });
    if (isJsonMode()) {
      emitJsonEvent({ type: "create", webhook: created });
      return;
    }
    success(`Created webhook ${created.id}`);
    info(`URL: ${buildWebhookUrl(session.baseUrl, created.id)}`);
  } catch (err) {
    handleCreateError(err, planUrl);
  }
};
