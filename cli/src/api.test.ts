import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateWebhookError,
  classifyWebhook,
  createWebhook,
  deleteWebhook,
  exchangeAuthorizationCode,
  getMe,
  getWebhookRequests,
  getWebhookSourceRequest,
  getWebhooks,
} from "./api";
import { HttpError } from "./errors";

const BASE_URL = "https://api.example";
const TOKEN = "TKN";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("getMe", () => {
  it("issues a Bearer-authenticated GET to /api/account/me and returns the JSON", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        id: "u1",
        name: "Foo",
        email: "foo@example.com",
        image: null,
        plan: { key: "metered", name: "Metered", limits: {} },
      }),
    );
    const me = await getMe(BASE_URL, TOKEN);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/api/account/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TKN");
    expect(me.email).toBe("foo@example.com");
  });

  it("throws HttpError on non-2xx", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    await expect(getMe(BASE_URL, TOKEN)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("getWebhooks", () => {
  it("returns the webhooks array from { webhooks: [...] }", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { webhooks: [{ id: "ohmh-a", enabled: true }] }));
    const list = await getWebhooks(BASE_URL, TOKEN);
    expect(list).toEqual([{ id: "ohmh-a", enabled: true }]);
  });

  it("falls back to [] when the body has no `webhooks` field", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));
    expect(await getWebhooks(BASE_URL, TOKEN)).toEqual([]);
  });
});

describe("createWebhook", () => {
  it("returns the webhook on 201", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(201, { id: "ohmh-new", enabled: true }));
    const created = await createWebhook(BASE_URL, TOKEN, { type: "persistent" });
    expect(created.id).toBe("ohmh-new");
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("maps 402 + kind:persistent to CreateWebhookError carrying kind and reason", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(402, {
        message: "limit reached",
        kind: "persistent",
        reason: "plan",
      }),
    );
    await expect(
      createWebhook(BASE_URL, TOKEN, { type: "persistent" }),
    ).rejects.toMatchObject({
      status: 402,
      kind: "persistent",
      reason: "plan",
    });
  });

  it("falls back gracefully when the error body is not JSON", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not-json", { status: 500 }));
    let caught: unknown;
    try {
      await createWebhook(BASE_URL, TOKEN, { type: "persistent" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CreateWebhookError);
    expect((caught as CreateWebhookError).status).toBe(500);
  });
});

describe("deleteWebhook", () => {
  it("returns true on 200", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { deleted: true }));
    expect(await deleteWebhook(BASE_URL, TOKEN, "ohmh-a")).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/api/webhooks/ohmh-a");
    expect(init.method).toBe("DELETE");
  });

  it("returns false on 404 (idempotent semantics)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: "not found" }));
    expect(await deleteWebhook(BASE_URL, TOKEN, "ohmh-missing")).toBe(false);
  });

  it("throws HttpError for other failures (e.g. 500)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
    await expect(deleteWebhook(BASE_URL, TOKEN, "ohmh-a")).rejects.toBeInstanceOf(HttpError);
  });
});

describe("getWebhookRequests", () => {
  it("passes limit and offset as query params", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { requests: [] }));
    await getWebhookRequests(BASE_URL, TOKEN, "ohmh-a", 5, 10);
    const [url] = fetchSpy.mock.calls[0] as [URL | string];
    const built = typeof url === "string" ? new URL(url) : url;
    expect(built.searchParams.get("limit")).toBe("5");
    expect(built.searchParams.get("offset")).toBe("10");
  });

  it("returns [] when body has no `requests` field", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));
    expect(await getWebhookRequests(BASE_URL, TOKEN, "ohmh-a", 1, 0)).toEqual([]);
  });
});

describe("getWebhookSourceRequest", () => {
  it("URL-encodes the request id", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { id: "req/with slash", webhookId: "ohmh-a", method: "GET", url: "/", createdAt: "", headers: {}, body: null }),
    );
    await getWebhookSourceRequest(BASE_URL, TOKEN, "ohmh-a", "req/with slash");
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(
      "https://api.example/api/webhooks/ohmh-a/requests/req%2Fwith%20slash",
    );
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts grant_type=authorization_code with code_verifier and returns the access token", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { accessToken: "T" }));
    const out = await exchangeAuthorizationCode(BASE_URL, {
      clientId: "ohmh-cli",
      redirectUri: "http://127.0.0.1:53682/callback",
      code: "abc",
      codeVerifier: "ver",
    });
    expect(out.accessToken).toBe("T");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/oauth2/token");
    expect(init.method).toBe("POST");
    const body = init.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("abc");
    expect(params.get("code_verifier")).toBe("ver");
    expect(params.get("client_id")).toBe("ohmh-cli");
    expect(params.get("redirect_uri")).toBe("http://127.0.0.1:53682/callback");
  });
});

describe("classifyWebhook", () => {
  it("returns 'ephemeral' when expiresAt is set", () => {
    expect(classifyWebhook({ expiresAt: "2026-01-01" })).toBe("ephemeral");
  });

  it("returns 'persistent' when expiresAt is null", () => {
    expect(classifyWebhook({ expiresAt: null })).toBe("persistent");
    expect(classifyWebhook({})).toBe("persistent");
  });
});
