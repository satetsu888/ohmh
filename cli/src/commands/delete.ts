import { deleteWebhook } from "../api";
import { CliError, EXIT_NOT_FOUND } from "../errors";
import { requireSession } from "../session/currentSession";
import { confirm } from "../ui/prompt";
import { emitJsonEvent, isJsonMode, success } from "../ui/logger";

export type DeleteOptions = {
  webhookId: string;
  skipConfirm: boolean;
  baseUrlOverride?: string;
};

export const deleteCommand = async (opts: DeleteOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);

  if (!opts.skipConfirm) {
    const ok = await confirm(`Delete webhook "${opts.webhookId}"?`, false);
    if (!ok) {
      throw new CliError("cancelled");
    }
  }

  const removed = await deleteWebhook(session.baseUrl, session.token, opts.webhookId);
  if (!removed) {
    throw new CliError(`webhook not found: ${opts.webhookId}`, EXIT_NOT_FOUND);
  }
  if (isJsonMode()) {
    emitJsonEvent({ type: "delete", webhookId: opts.webhookId, deleted: true });
    return;
  }
  success(`Deleted webhook ${opts.webhookId}`);
};
