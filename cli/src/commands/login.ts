import { exchangeAuthorizationCode, getMe } from "../api";
import { createPkcePair, generateState } from "../auth/pkce";
import { startLoopback } from "../auth/loopback";
import { CliError, EXIT_AUTH_ERROR } from "../errors";
import { openSecretStore } from "../session/currentSession";
import { error, info, isJsonMode, success, emitJsonEvent } from "../ui/logger";

const CLIENT_ID = "ohmh-cli";
const SCOPES = "1st";
const SIGNIN_TIMEOUT_MS = 5 * 60 * 1000;

export type LoginOptions = {
  baseUrlOverride?: string;
};

export const loginCommand = async (opts: LoginOptions): Promise<void> => {
  const { baseUrl, store, storeKey } = openSecretStore(opts.baseUrlOverride);

  const loopback = await startLoopback();
  const pkce = createPkcePair();
  const state = generateState();

  const authorizeUrl = new URL(`${baseUrl}/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", loopback.redirectUri);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", pkce.codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);

  if (!isJsonMode()) {
    info(`opening browser to sign in: ${authorizeUrl.toString()}`);
    info(`(if the browser does not open automatically, copy and paste the URL above)`);
  }

  // Open the browser. The URL was already printed, so a failure here is non-fatal.
  // `open` is an ESM-only package, so import it dynamically (tsup bundles it into the CJS output).
  try {
    const { default: open } = await import("open");
    await open(authorizeUrl.toString());
  } catch (err) {
    error(`failed to open browser: ${err instanceof Error ? err.message : String(err)}`);
    error(`please open the URL above manually.`);
  }

  let result;
  try {
    result = await loopback.waitForCallback(SIGNIN_TIMEOUT_MS);
  } finally {
    loopback.close();
  }
  if (result.state && result.state !== state) {
    throw new CliError("OAuth state mismatch", EXIT_AUTH_ERROR);
  }

  const exchanged = await exchangeAuthorizationCode(baseUrl, {
    clientId: CLIENT_ID,
    redirectUri: loopback.redirectUri,
    code: result.code,
    codeVerifier: pkce.codeVerifier,
  });

  await store.set(storeKey, exchanged.accessToken);

  // Fetch and display the profile. The token is already stored, so a profile
  // fetch failure does not fail the login itself.
  let displayName: string | null = null;
  let email: string | null = null;
  let planName: string | null = null;
  try {
    const me = await getMe(baseUrl, exchanged.accessToken);
    displayName = me.name;
    email = me.email;
    planName = me.plan.name;
  } catch (err) {
    error(`signed in, but failed to fetch profile: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (isJsonMode()) {
    emitJsonEvent({ type: "login", baseUrl, name: displayName, email, plan: planName });
    return;
  }

  if (displayName && email && planName) {
    success(`Logged in as ${displayName} <${email}> on ${planName}`);
  } else {
    success(`Logged in to ${baseUrl}`);
  }
};
