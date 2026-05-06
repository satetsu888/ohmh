import { getMe } from "../api";
import { requireSession } from "../session/currentSession";
import { emitJsonEvent, info, isJsonMode } from "../ui/logger";

export type WhoamiOptions = {
  baseUrlOverride?: string;
};

const formatCents = (cents: number): string => {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
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
    `Limits  : ephemeral ${me.plan.limits.ephemeral} / persistent ${me.plan.limits.persistent}`,
  );
  info(
    `Quotas  : ${me.plan.limits.requestsPerDay} req/day` +
      (me.plan.limits.historyDays ? ` · history ${me.plan.limits.historyDays}d` : ""),
  );

  if (me.currentPeakPersistent !== undefined) {
    info(``);
    info(`This period:`);
    info(`  Persistent webhooks (peak) : ${me.currentPeakPersistent}`);
    if (me.estimatedUsageChargeCents !== undefined) {
      info(
        `  Estimated usage charge     : ${formatCents(me.estimatedUsageChargeCents)} ` +
          `(= ${me.currentPeakPersistent} × $0.60)`,
      );
    }
  }
};
