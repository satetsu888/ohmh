import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkcePair, generateState } from "./pkce";

const URL_SAFE = /^[A-Za-z0-9_-]+$/;

describe("createPkcePair", () => {
  it("returns S256 challenge that matches sha256(verifier).digest('base64url')", () => {
    // Server-side verifyPKCE compares against the same base64url digest.
    // A drift here breaks login end-to-end.
    const pair = createPkcePair();
    expect(pair.codeChallengeMethod).toBe("S256");
    const expected = createHash("sha256").update(pair.codeVerifier).digest("base64url");
    expect(pair.codeChallenge).toBe(expected);
  });

  it("emits URL-safe verifier and challenge with no base64 padding", () => {
    const pair = createPkcePair();
    expect(pair.codeVerifier).toMatch(URL_SAFE);
    expect(pair.codeChallenge).toMatch(URL_SAFE);
  });

  it("uses a verifier within the PKCE spec length range (43-128)", () => {
    const pair = createPkcePair();
    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it("emits a fresh verifier on each call", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

describe("generateState", () => {
  it("returns a non-empty random URL-safe token", () => {
    const a = generateState();
    const b = generateState();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toMatch(URL_SAFE);
    expect(a).not.toBe(b);
  });
});
