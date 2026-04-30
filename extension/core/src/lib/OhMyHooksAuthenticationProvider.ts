import {
  authentication,
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationProviderSessionOptions,
  AuthenticationSession,
  Disposable,
  env,
  Event,
  EventEmitter,
  ExtensionContext,
  ProgressLocation,
  Uri,
  UriHandler,
  window,
} from "vscode";
import { v4 as uuid } from "uuid";
import { PromiseAdapter, promiseFromEvent } from "../util";

const CLIENT_ID = "oh-my-hooks-extension";
const REDIRECT_URI = "vscode://undefined_publisher.oh-my-hooks";
const SESSIONS_SECRET_KEY = "oh-my-hooks-sessions";
const BASE_URL = process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787";

class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
  public handleUri(uri: Uri) {
    this.fire(uri);
  }
}

class OhMyHooksAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  private _sessionChangeEmitter =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: Disposable;
  private _pendingStates: string[] = [];
  private _codeExchangePromises = new Map<
    string,
    { promise: Promise<string>; cancel: EventEmitter<void> }
  >();
  private _uriHandler = new UriEventHandler();

  constructor(private readonly context: ExtensionContext) {
    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(
        "oh-my-hooks",
        "oh-my-hooks",
        this,
        { supportsMultipleAccounts: false }
      ),
      window.registerUriHandler(this._uriHandler)
    );
  }

  get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
    console.log("onDidChangeSessions");
    return this._sessionChangeEmitter.event;
  }

  public async getSessions(
    scopes: readonly string[] | undefined,
    options: AuthenticationProviderSessionOptions
  ): Promise<AuthenticationSession[]> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

    if (allSessions) {
      return JSON.parse(allSessions) as AuthenticationSession[];
    }

    return [];
  }

  public async removeSession(sessionId: string): Promise<void> {
    console.log("removeSession", sessionId);

    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

    console.log("allSessions", allSessions);
    if (allSessions) {
      let sessions = JSON.parse(allSessions) as AuthenticationSession[];
      const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);

      await this.context.secrets.store(
        SESSIONS_SECRET_KEY,
        JSON.stringify(sessions)
      );

      if (session) {
        this._sessionChangeEmitter.fire({
          added: [],
          removed: [session],
          changed: [],
        });
      }
    }
  }

  public async dispose() {
    this._disposable.dispose();
  }

  public async createSession(scopes: string[]): Promise<AuthenticationSession> {
    const defaultScopes = ["1st"];

    try {
      const token = await this.login([...scopes, ...defaultScopes]);
      if (!token) {
        throw new Error(`login failure`);
      }

      const userinfo = await this.getUserInfo(token);
      if (!userinfo.email || !userinfo.name) {
        throw new Error("Failed to get user info");
      }

      const session: AuthenticationSession = {
        id: uuid(),
        accessToken: token,
        account: {
          id: userinfo.email,
          label: userinfo.name,
        },
        scopes: [...scopes, ...defaultScopes],
      };

      await this.context.secrets.store(
        SESSIONS_SECRET_KEY,
        JSON.stringify([session])
      );
      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      return session;
    } catch (e) {
      window.showErrorMessage(`Sign in failed: ${e}`);
      throw e;
    }
  }

  private async login(scopes: string[] = []) {
    return await window.withProgress<string>(
      {
        location: ProgressLocation.Notification,
        title: "Signing in to oh-my-hooks...",
        cancellable: true,
      },
      async (_, taskCancelToken) => {
        const stateId = uuid();
        this._pendingStates.push(stateId);
        const scopeString = scopes.join(" ");

        const searchParams = new URLSearchParams([
          ["response_type", "code"],
          ["client_id", CLIENT_ID],
          ["redirect_uri", REDIRECT_URI],
          ["state", stateId],
          ["scope", scopeString],
          ["code_challenge", stateId],
          ["code_challenge_method", "plain"],
        ]);
        const uri = Uri.parse(
          `${BASE_URL}/oauth2/authorize?${searchParams.toString()}`
        );
        await env.openExternal(uri);

        let codeExchangePromise = this._codeExchangePromises.get(scopeString);
        if (!codeExchangePromise) {
          codeExchangePromise = promiseFromEvent(
            this._uriHandler.event,
            this.handleUri(scopes)
          );
          this._codeExchangePromises.set(scopeString, codeExchangePromise);
        }

        try {
          return await Promise.race([
            codeExchangePromise.promise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject("Cancelled"), 60000)
            ),
            promiseFromEvent<any, any>(
              taskCancelToken.onCancellationRequested,
              (_, reject) => {
                reject("User Cancelled");
              }
            ).promise,
          ]);
        } finally {
          this._pendingStates = this._pendingStates.filter(
            (n) => n !== stateId
          );
          codeExchangePromise?.cancel.fire();
          this._codeExchangePromises.delete(scopeString);
        }
      }
    );
  }

  private handleUri: (
    scopes: readonly string[]
  ) => PromiseAdapter<Uri, string> =
    (scopes) => async (uri, resolve, reject) => {
      const query = new URLSearchParams(uri.query);
      const code = query.get("code");
      const state = query.get("state");

      if (!code) {
        console.error("No authorization code");
        reject(new Error("No authorization code"));
        return;
      }
      if (!state) {
        console.error("No state");
        reject(new Error("No state"));
        return;
      }

      if (!this._pendingStates.some((n) => n === state)) {
        console.error("State not found");
        reject(new Error("State not found"));
        return;
      }

      const access_token = await this.exchangeCodeForToken(code, state);
      console.log("Got access token:", access_token);
      resolve(access_token);
    };

  private async getUserInfo(token: string) {
    const response = await fetch(`${BASE_URL}/api/account/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return (await response.json()) as { email: string; name: string };
  }

  private async exchangeCodeForToken(code: string, code_verifier: string) {
    const searchParams = new URLSearchParams([
      ["grant_type", "authorization_code"],
      ["client_id", CLIENT_ID],
      ["redirect_uri", REDIRECT_URI],
      ["code", code],
      ["code_verifier", code_verifier],
    ]);

    const response = await fetch(`${BASE_URL}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: searchParams.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to exchange code for token: ${response.statusText}`
      );
    }

    const tokenResponse = (await response.json()) as { accessToken: string };
    return tokenResponse.accessToken;
  }
}

export default OhMyHooksAuthenticationProvider;
