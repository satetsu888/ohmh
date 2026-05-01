import { createHash, randomBytes } from "node:crypto";

// Server (front/app/services/oauth2.server.ts verifyPKCE) compares
//   sha256(verifier) using `digest("base64")` (standard base64), so we generate
// the challenge with the same encoding here. `URLSearchParams` percent-encodes
// "+" / "/" automatically, so no extra escaping is needed when putting it in a URL.

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

export const createPkcePair = (): PkcePair => {
  // 32 bytes -> 43 base64url chars (43-128 is the valid range per the PKCE spec).
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64");
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
};

export const generateState = (): string => {
  return randomBytes(16).toString("base64url");
};
