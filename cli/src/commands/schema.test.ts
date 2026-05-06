import { describe, expect, it } from "vitest";
import { __schema } from "./schema";

describe("schema", () => {
  it("declares Draft 2020-12 and an $id", () => {
    expect(__schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(__schema.$id).toMatch(/^https?:\/\//);
  });

  it("uses oneOf at the root with all expected event types", () => {
    const titles = __schema.oneOf
      .map((entry) => {
        const ref = entry.$ref.replace("#/$defs/", "");
        return ref;
      })
      .sort();
    expect(titles).toEqual(
      [
        "connectRequest",
        "create",
        "delete",
        "error",
        "list",
        "login",
        "loginUrl",
        "logout",
        "ready",
        "requestDetail",
        "requests",
        "resend",
        "whoami",
      ].sort(),
    );
  });

  it("ready has the documented fields", () => {
    expect(__schema.$defs.ready.required).toEqual([
      "type",
      "mode",
      "webhookId",
      "url",
      "forwardPort",
    ]);
    expect(__schema.$defs.ready.properties.mode.enum).toEqual([
      "anonymous",
      "ephemeral",
      "persistent",
    ]);
  });

  it("error has all known codes", () => {
    expect(__schema.$defs.error.properties.code.enum).toEqual(
      expect.arrayContaining([
        "general_error",
        "auth_required",
        "plan_limit_upgradable",
        "plan_limit_top",
        "not_found",
        "bad_input",
      ]),
    );
  });
});
