import { createHash, randomBytes } from "node:crypto";

// RFC 7636 PKCE helpers. The challenge is sha256(verifier) encoded as
// base64url without padding, which is the only encoding the spec allows for
// `code_challenge_method=S256`. Server, CLI, and the VS Code extension all go
// through this module so the encoding stays in sync.

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

export const createPkcePair = (): PkcePair => {
  // 32 bytes -> 43 base64url chars (43-128 is the valid range per the PKCE spec).
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
};

export const generateState = (): string => {
  return randomBytes(16).toString("base64url");
};
