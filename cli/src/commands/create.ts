import { CreateWebhookError, createWebhook } from "../api";
import { buildWebhookUrl } from "../config";
import { CliError, EXIT_BAD_INPUT, EXIT_PLAN_LIMIT } from "../errors";
import { requireSession } from "../session/currentSession";
import { emitJsonEvent, info, isJsonMode, success } from "../ui/logger";

export type CreateOptions = {
  baseUrlOverride?: string;
};

const handleCreateError = (err: unknown, planUrl: string): never => {
  if (err instanceof CreateWebhookError) {
    if (err.status === 402) {
      const target =
        err.kind === "persistent"
          ? "persistent webhook limit"
          : err.kind === "ephemeral"
            ? "ephemeral webhook limit"
            : "plan limit";
      throw new CliError(
        `${target} reached. Upgrade your plan: ${planUrl}`,
        EXIT_PLAN_LIMIT,
      );
    }
    if (err.status === 400) {
      throw new CliError(`invalid input: ${err.message}`, EXIT_BAD_INPUT);
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
