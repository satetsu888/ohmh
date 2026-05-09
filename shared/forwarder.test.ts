import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forward } from "./forwarder";
import type { RequestMessage } from "./protocol";

const baseRequest = (override: Partial<RequestMessage> = {}): RequestMessage => ({
  type: "request",
  sourceRequestId: "src-1",
  webhookId: "wh_1",
  method: "POST",
  url: "/payments",
  headers: { "content-type": "application/json", "x-foo": "bar" },
  body: '{"hi":"there"}',
  receivedAt: new Date(0).toISOString(),
  ...override,
});

const mockResponse = (init: Partial<{ status: number; body: string; headers: Record<string, string> }> = {}): Response => {
  const status = init.status ?? 200;
  const body = init.body ?? "ok";
  const headers = new Headers(init.headers ?? { "content-type": "text/plain" });
  return new Response(body, { status, headers });
};

describe("forward", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("posts the request body to http://localhost:<port><url>", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({ status: 200, body: "OK" }));

    const result = await forward(baseRequest(), { port: 3000 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/payments");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"hi":"there"}');
    expect(result.status).toBe(200);
    expect(result.body).toBe("OK");
    expect(result.error).toBeNull();
  });

  it("strips hop-by-hop headers (connection / host / content-length / transfer-encoding) before forwarding", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse());
    const req = baseRequest({
      headers: {
        "Connection": "keep-alive",
        "Keep-Alive": "timeout=5",
        "Transfer-Encoding": "chunked",
        "Host": "ohmyhooks.com",
        "Content-Length": "10",
        "x-keep": "yes",
      },
    });

    await forward(req, { port: 3000 });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-keep"]).toBe("yes");
    expect(headers["Connection"]).toBeUndefined();
    expect(headers["Keep-Alive"]).toBeUndefined();
    expect(headers["Transfer-Encoding"]).toBeUndefined();
    expect(headers["Host"]).toBeUndefined();
    expect(headers["Content-Length"]).toBeUndefined();
  });

  it("does not send a body for GET", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse());
    const req = baseRequest({ method: "GET", body: "ignored" });

    await forward(req, { port: 3000 });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("does not send a body for HEAD", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse());
    const req = baseRequest({ method: "HEAD", body: "ignored" });

    await forward(req, { port: 3000 });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("does not send a body when body is null even on POST", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse());
    const req = baseRequest({ method: "POST", body: null });

    await forward(req, { port: 3000 });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("returns response headers as a plain object", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ headers: { "content-type": "application/json", "x-trace": "abc" } }),
    );

    const result = await forward(baseRequest(), { port: 3000 });

    expect(result.headers["content-type"]).toBe("application/json");
    expect(result.headers["x-trace"]).toBe("abc");
  });

  it("captures network errors into ForwardResult.error and leaves status null", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await forward(baseRequest(), { port: 3000 });

    expect(result.status).toBeNull();
    expect(result.body).toBeNull();
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records durationMs on success", async () => {
    fetchSpy.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return mockResponse();
    });

    const result = await forward(baseRequest(), { port: 3000 });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("refuses to forward when request.url is an absolute URL pointing to a non-localhost host (SSRF guard)", async () => {
    const req = baseRequest({ url: "http://evil.example/path" });

    const result = await forward(req, { port: 3000 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/non-localhost origin/);
  });

  it("refuses to forward when request.url is protocol-relative (//host/path)", async () => {
    const req = baseRequest({ url: "//evil.example/path" });

    const result = await forward(req, { port: 3000 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/non-localhost origin/);
  });

  it("aborts and reports a timeout error when the local server hangs", async () => {
    fetchSpy.mockImplementationOnce(async (_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return mockResponse();
    });

    const result = await forward(baseRequest(), { port: 3000, timeoutMs: 20 });

    expect(result.status).toBeNull();
    expect(result.error).toMatch(/timed out after 20ms/);
  });

  it("rejects responses larger than maxResponseBytes", async () => {
    const oversized = "x".repeat(100);
    fetchSpy.mockResolvedValueOnce(mockResponse({ body: oversized }));

    const result = await forward(baseRequest(), { port: 3000, maxResponseBytes: 10 });

    expect(result.status).toBeNull();
    expect(result.error).toMatch(/exceeded 10 bytes/);
  });
});
