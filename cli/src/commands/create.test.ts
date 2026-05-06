import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommand } from "./create";
import * as api from "../api";
import * as session from "../session/currentSession";
import { setJsonMode } from "../ui/logger";

describe("createCommand 402 differentiation", () => {
  beforeEach(() => {
    vi.spyOn(session, "requireSession").mockResolvedValue({
      baseUrl: "https://ohmh.satetsu888.dev",
      token: "T",
      // store / storeKey are unused by createCommand
      store: {} as never,
      storeKey: "" as never,
    });
    setJsonMode(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setJsonMode(false);
  });

  it("Free plan (webhookLimit=0) → plan_limit_upgradable, message mentions Upgrade to Metered", async () => {
    vi.spyOn(api, "createWebhook").mockRejectedValue(
      new api.CreateWebhookError(
        "You have reached your webhook limit. Please upgrade your plan to create more webhooks.",
        402,
        { webhookLimit: 0, kind: "persistent" },
        "persistent",
        undefined,
        0,
      ),
    );
    await expect(createCommand({})).rejects.toMatchObject({
      code: "plan_limit_upgradable",
      exitCode: 3,
      kind: "persistent",
      webhookLimit: 0,
      status: 402,
    });
    await expect(createCommand({})).rejects.toThrow(/Upgrade to Metered/i);
  });

  it("Metered plan top tier (webhookLimit=10) → plan_limit_top, message mentions delete", async () => {
    vi.spyOn(api, "createWebhook").mockRejectedValue(
      new api.CreateWebhookError(
        "limit reached",
        402,
        { webhookLimit: 10, kind: "persistent" },
        "persistent",
        undefined,
        10,
      ),
    );
    await expect(createCommand({})).rejects.toMatchObject({
      code: "plan_limit_top",
      exitCode: 3,
      kind: "persistent",
      webhookLimit: 10,
      status: 402,
    });
    await expect(createCommand({})).rejects.toThrow(/Delete an unused/i);
  });

  it("400 → bad_input (exit 5)", async () => {
    vi.spyOn(api, "createWebhook").mockRejectedValue(
      new api.CreateWebhookError("bad type", 400, null, undefined, undefined, undefined),
    );
    await expect(createCommand({})).rejects.toMatchObject({
      code: "bad_input",
      exitCode: 5,
    });
  });
});
