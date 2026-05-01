import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startLoopback, type LoopbackHandle } from "./loopback";

const TIMEOUT_MS = 2_000;

let handle: LoopbackHandle | null = null;

beforeEach(async () => {
  handle = await startLoopback();
});

afterEach(() => {
  handle?.close();
  handle = null;
});

const get = (path: string): Promise<Response> => {
  if (!handle) throw new Error("loopback not started");
  return fetch(`http://127.0.0.1:${handle.port}${path}`);
};

describe("loopback callback", () => {
  it("resolves with code and state when both are present", async () => {
    if (!handle) throw new Error("loopback not started");
    const waiting = handle.waitForCallback(TIMEOUT_MS);
    const res = await get("/callback?code=AUTHCODE&state=STATEVAL");
    expect(res.status).toBe(200);
    const result = await waiting;
    expect(result).toEqual({ code: "AUTHCODE", state: "STATEVAL" });
  });

  it("rejects and returns 400 when state is missing", async () => {
    if (!handle) throw new Error("loopback not started");
    const settled = handle.waitForCallback(TIMEOUT_MS).then(
      (value) => ({ ok: true as const, value }),
      (error: Error) => ({ ok: false as const, error }),
    );
    const res = await get("/callback?code=AUTHCODE");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("missing code or state");
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/missing code or state/);
  });

  it("rejects and returns 400 when code is missing", async () => {
    if (!handle) throw new Error("loopback not started");
    const settled = handle.waitForCallback(TIMEOUT_MS).then(
      (value) => ({ ok: true as const, value }),
      (error: Error) => ({ ok: false as const, error }),
    );
    const res = await get("/callback?state=STATEVAL");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("missing code or state");
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/missing code or state/);
  });

  it("returns 404 for paths other than /callback", async () => {
    const res = await get("/other");
    expect(res.status).toBe(404);
  });
});
