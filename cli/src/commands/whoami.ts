import { getMe } from "../api";
import { requireSession } from "../session/currentSession";
import { emitJsonEvent, info, isJsonMode } from "../ui/logger";

export type WhoamiOptions = {
  baseUrlOverride?: string;
};

export const whoamiCommand = async (opts: WhoamiOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);
  const me = await getMe(session.baseUrl, session.token);

  if (isJsonMode()) {
    emitJsonEvent({ type: "whoami", ...me });
    return;
  }

  info(`Email   : ${me.email}`);
  info(`Name    : ${me.name}`);
  info(`Plan    : ${me.plan.name}`);
  info(
    `Limits  : ephemeral ${me.plan.limits.ephemeral} / persistent ${me.plan.limits.persistent} / custom URL ${me.plan.limits.customUrl}`,
  );
  info(
    `Quotas  : ${me.plan.limits.requestsPerDay} req/day` +
      (me.plan.limits.historyDays ? ` · history ${me.plan.limits.historyDays}d` : ""),
  );
};
