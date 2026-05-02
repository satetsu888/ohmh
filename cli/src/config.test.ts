import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { buildWebhookUrl, buildWsUrl, resolveBaseUrl, resolveCliConfig } from "./config";

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

describe("resolveBaseUrl", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.OH_MY_HOOKS_BASE_URL;
    delete process.env.OH_MY_HOOKS_BASE_URL;
  });

  afterEach(() => {
    restoreEnv("OH_MY_HOOKS_BASE_URL", originalEnv);
  });

  it("returns the explicit override when given", () => {
    process.env.OH_MY_HOOKS_BASE_URL = "https://from-env.example";
    expect(resolveBaseUrl("https://override.example")).toBe("https://override.example");
  });

  it("falls back to OH_MY_HOOKS_BASE_URL when no override", () => {
    process.env.OH_MY_HOOKS_BASE_URL = "https://from-env.example";
    expect(resolveBaseUrl()).toBe("https://from-env.example");
  });

  it("falls back to the default base URL when neither is set", () => {
    expect(resolveBaseUrl()).toBe("https://ohmh.satetsu888.dev");
  });

  it("trims trailing slashes", () => {
    expect(resolveBaseUrl("https://x.example/")).toBe("https://x.example");
    expect(resolveBaseUrl("https://x.example///")).toBe("https://x.example");
  });

  it("treats whitespace-only override as unset", () => {
    process.env.OH_MY_HOOKS_BASE_URL = "https://from-env.example";
    expect(resolveBaseUrl("   ")).toBe("https://from-env.example");
  });
});

describe("resolveCliConfig", () => {
  let originalXdg: string | undefined;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalXdg = process.env.XDG_CONFIG_HOME;
    originalEnv = process.env.OH_MY_HOOKS_BASE_URL;
    delete process.env.OH_MY_HOOKS_BASE_URL;
  });

  afterEach(() => {
    restoreEnv("XDG_CONFIG_HOME", originalXdg);
    restoreEnv("OH_MY_HOOKS_BASE_URL", originalEnv);
  });

  it("uses $XDG_CONFIG_HOME/ohmh on Linux/macOS when set", () => {
    if (process.platform === "win32") {
      return;
    }
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-fixture";
    const cfg = resolveCliConfig();
    expect(cfg.configDir).toBe(path.join("/tmp/xdg-fixture", "ohmh"));
    expect(cfg.credentialsPath).toBe(path.join("/tmp/xdg-fixture", "ohmh", "credentials.json"));
  });

  it("falls back to ~/.config/ohmh on Linux/macOS when XDG_CONFIG_HOME is unset", () => {
    if (process.platform === "win32") {
      return;
    }
    delete process.env.XDG_CONFIG_HOME;
    const cfg = resolveCliConfig();
    expect(cfg.configDir).toBe(path.join(os.homedir(), ".config", "ohmh"));
  });
});

describe("buildWsUrl", () => {
  it("rewrites http -> ws and appends /ws", () => {
    expect(buildWsUrl("http://localhost:8787")).toBe("ws://localhost:8787/ws");
  });

  it("rewrites https -> wss and appends /ws", () => {
    expect(buildWsUrl("https://ohmh.satetsu888.dev")).toBe("wss://ohmh.satetsu888.dev/ws");
  });
});

describe("buildWebhookUrl", () => {
  it("replaces the leading subdomain of the base host with the webhook id", () => {
    expect(buildWebhookUrl("https://ohmh.satetsu888.dev", "ohmh_abc")).toBe(
      "https://ohmh_abc.satetsu888.dev/",
    );
  });

  it("prepends the webhook id when the host has no subdomain (localhost / non-default ports)", () => {
    expect(buildWebhookUrl("http://localhost:8787", "ohmh_xyz")).toBe(
      "http://ohmh_xyz.localhost:8787/",
    );
  });
});
