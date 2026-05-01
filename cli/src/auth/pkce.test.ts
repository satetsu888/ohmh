import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkcePair, generateState } from "./pkce";

describe("createPkcePair", () => {
  it("returns S256 challenge that matches sha256(verifier).digest('base64')", () => {
    // Login fails if the digest format doesn't match the server-side verifyPKCE
    // (see front/app/services/oauth2.server.ts).
    const pair = createPkcePair();
    expect(pair.codeChallengeMethod).toBe("S256");
    const expected = createHash("sha256").update(pair.codeVerifier).digest("base64");
    expect(pair.codeChallenge).toBe(expected);
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
  it("returns a non-empty random token", () => {
    const a = generateState();
    const b = generateState();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
