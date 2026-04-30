import { CreateWebhookError, createWebhook, getMe } from "../api";
import { buildWebhookUrl } from "../config";
import { CliError, EXIT_BAD_INPUT, EXIT_PLAN_LIMIT } from "../errors";
import { requireSession } from "../session/currentSession";
import { isInteractive, select, text } from "../ui/prompt";
import { emitJsonEvent, info, isJsonMode, success } from "../ui/logger";

const CUSTOM_SUBDOMAIN_RE = /^[a-z0-9]{3,20}$/;
const CUSTOM_SUBDOMAIN_AUTO_PREFIX = "wh_";

export type CreateOptions = {
  persistent: boolean;
  custom?: string;
  baseUrlOverride?: string;
};

const validateCustomSubdomain = (value: string): string | true => {
  if (!CUSTOM_SUBDOMAIN_RE.test(value)) {
    return "Subdomain must be 3-20 lowercase alphanumeric characters";
  }
  if (value.startsWith(CUSTOM_SUBDOMAIN_AUTO_PREFIX)) {
    return `Subdomain must not start with "${CUSTOM_SUBDOMAIN_AUTO_PREFIX}"`;
  }
  return true;
};

const handleCreateError = (err: unknown, planUrl: string): never => {
  if (err instanceof CreateWebhookError) {
    if (err.status === 402) {
      const target =
        err.kind === "customUrl"
          ? "custom URL slot limit"
          : err.kind === "persistent"
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
  const planUrl = `${session.baseUrl}/settings/manage-plan`;

  // 1) options に既に十分な情報があるならそのまま使う
  let kind: "persistent" | "customUrl";
  let customSubdomain: string | undefined;

  if (opts.custom !== undefined) {
    const result = validateCustomSubdomain(opts.custom);
    if (result !== true) {
      throw new CliError(result, EXIT_BAD_INPUT);
    }
    kind = "customUrl";
    customSubdomain = opts.custom;
  } else if (opts.persistent) {
    kind = "persistent";
  } else if (isInteractive()) {
    // インタラクティブ選択
    const me = await getMe(session.baseUrl, session.token);
    const isPro = me.plan.customSubdomain && me.plan.limits.customUrl > 0;
    const picked = await select<"persistent" | "customUrl">("Choose webhook type", [
      {
        title: "Persistent webhook",
        description: `${me.plan.limits.persistent} slot(s) on ${me.plan.name}`,
        value: "persistent",
      },
      {
        title: isPro ? "Custom URL webhook" : "Custom URL webhook (Pro plan required)",
        description: isPro
          ? "1 slot on Pro · pick your own subdomain"
          : "Custom URL requires the Pro plan",
        value: "customUrl",
        disabled: !isPro,
      },
    ]);
    if (!picked) {
      throw new CliError("cancelled", EXIT_BAD_INPUT);
    }
    kind = picked;
    if (kind === "customUrl") {
      const sub = await text("Custom subdomain (3-20 lowercase alphanumerics)", validateCustomSubdomain);
      if (sub === undefined) {
        throw new CliError("cancelled", EXIT_BAD_INPUT);
      }
      customSubdomain = sub;
    }
  } else {
    // non-TTY: 既定で persistent
    kind = "persistent";
  }

  try {
    const created = await createWebhook(session.baseUrl, session.token, {
      type: "persistent",
      customSubdomain: kind === "customUrl" ? customSubdomain : undefined,
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
