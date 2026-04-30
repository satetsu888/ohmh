import { createHash, randomBytes } from "node:crypto";

// Server (front/app/services/oauth2.server.ts verifyPKCE) は
//   sha256(verifier) を `digest("base64")` (= 標準 base64) と比較する。
// ここでも同じエンコードで challenge を作る。`URLSearchParams` が "+" / "/" を
// 自動でパーセントエンコードするので URL に乗せるときは特別な処理は要らない。

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

export const createPkcePair = (): PkcePair => {
  // 32 byte = 43 char (base64url, 43-128 が PKCE spec の有効範囲)
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64");
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
};

export const generateState = (): string => {
  return randomBytes(16).toString("base64url");
};
