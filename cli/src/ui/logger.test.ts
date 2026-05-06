import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError, EXIT_AUTH_ERROR, EXIT_BAD_INPUT } from "../errors";
import {
  emitJsonError,
  emitJsonEvent,
  setJsonMode,
  setQuiet,
  setVerbose,
} from "./logger";

describe("emitJsonError", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    setJsonMode(false);
    setQuiet(false);
    setVerbose(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setJsonMode(false);
  });

  it("does nothing in non-json mode", () => {
    setJsonMode(false);
    emitJsonError(new Error("nope"), 1);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("emits {type:error, code, exitCode, message, name} for plain Error", () => {
    setJsonMode(true);
    emitJsonError(new Error("plain"), 1);
    const line = (stdoutSpy.mock.calls[0]?.[0] as string).trim();
    const ev = JSON.parse(line);
    expect(ev).toEqual({
      type: "error",
      code: "general_error",
      exitCode: 1,
      message: "plain",
      name: "Error",
    });
  });

  it("propagates code from CliError subclasses", () => {
    setJsonMode(true);
    const err = new CliError("oops", EXIT_AUTH_ERROR, "auth_required");
    emitJsonError(err, EXIT_AUTH_ERROR);
    const line = (stdoutSpy.mock.calls[0]?.[0] as string).trim();
    const ev = JSON.parse(line);
    expect(ev.code).toBe("auth_required");
    expect(ev.exitCode).toBe(EXIT_AUTH_ERROR);
    expect(ev.message).toBe("oops");
    expect(ev.name).toBe("CliError");
  });

  it("merges in kind / reason / webhookLimit / status when present", () => {
    setJsonMode(true);
    const err = Object.assign(new CliError("limit", 3, "plan_limit_top"), {
      kind: "persistent",
      reason: "limit_reached",
      webhookLimit: 10,
      status: 402,
    });
    emitJsonError(err, 3);
    const line = (stdoutSpy.mock.calls[0]?.[0] as string).trim();
    const ev = JSON.parse(line);
    expect(ev).toMatchObject({
      type: "error",
      code: "plan_limit_top",
      exitCode: 3,
      kind: "persistent",
      reason: "limit_reached",
      webhookLimit: 10,
      status: 402,
    });
  });

  it("does not include extra fields when they are not strings/numbers", () => {
    setJsonMode(true);
    const err = Object.assign(new CliError("x", EXIT_BAD_INPUT, "bad_input"), {
      // wrong types — should be ignored
      kind: 42,
      webhookLimit: "10",
    });
    emitJsonError(err, EXIT_BAD_INPUT);
    const line = (stdoutSpy.mock.calls[0]?.[0] as string).trim();
    const ev = JSON.parse(line);
    expect(ev.kind).toBeUndefined();
    expect(ev.webhookLimit).toBeUndefined();
    expect(ev.code).toBe("bad_input");
  });
});

describe("emitJsonEvent", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setJsonMode(false);
  });

  it("does nothing in non-json mode", () => {
    setJsonMode(false);
    emitJsonEvent({ type: "ready", url: "x" });
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("writes a single NDJSON line in json mode", () => {
    setJsonMode(true);
    emitJsonEvent({ type: "ready", url: "x" });
    expect(stdoutSpy).toHaveBeenCalledWith('{"type":"ready","url":"x"}\n');
  });
});
