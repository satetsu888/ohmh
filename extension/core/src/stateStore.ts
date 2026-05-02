import * as vscode from "vscode";
import * as api from "./api";
import events from "events";

export type Status = {
  hasSession: boolean;
  isGuestMode: boolean;
  webhooks: Webhook[];
};

export type Webhook = api.Webhook & {
  // connecting: waiting for WS open / subscribe / server-issued id.
  // disconnecting: waiting for WS close (URL still visible in the UI to reflect real state).
  connection: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
  localPort: number | null;
  // Marks an anon webhook. id == "" means the entry is a placeholder before connect.
  isAnonymous?: boolean;
  // The single authed ephemeral entry kept at the top of the list. Connect issues
  // an id; Disconnect clears it.
  isEphemeral?: boolean;
};

export const buildEphemeralPlaceholder = (): Webhook => ({
  id: "",
  enabled: true,
  destinationUrls: [],
  expiresAt: null,
  connection: 'disconnected',
  localPort: null,
  isEphemeral: true,
});

export class StateStore extends events.EventEmitter implements vscode.Disposable {
  private _session: vscode.AuthenticationSession | null = null;
  private _webhooks: Webhook[] = [];
  private _isGuestMode = false;
  private _disposables: vscode.Disposable[] = [];
  private _context: vscode.ExtensionContext | null = null;
  private readonly PORT_STORAGE_KEY = 'oh-my-hooks.webhookPorts';
  private readonly GUEST_MODE_PREF_KEY = 'oh-my-hooks.guestModePref';

  public constructor (context?: vscode.ExtensionContext) {
    super();
    this._context = context || null;
    this._disposables.push(
      vscode.authentication.onDidChangeSessions(this.onDidChangeSessions)
    );

    (async () => {
      try {
        this._session = await this.getSession() || null;
      } catch (err) {
        // If authentication fails, ensure session is null
        this._session = null;
      }
      this.emit('statusChanged', this.get());
    })();
  }

  public dispose() {
    this._disposables.forEach(d => d.dispose());
    this.removeAllListeners();
  }

  public get = () => {
    return {
      hasSession: this._session ? true : false,
      isGuestMode: this._isGuestMode,
      webhooks: this._webhooks,
    };
  };

  private onDidChangeSessions = async (
    e: vscode.AuthenticationSessionsChangeEvent
  ) => {
    if (e.provider.id !== "oh-my-hooks") {
      return;
    }

    const session = await this.getSession();
    this._session = session || null;
    this.emit('statusChanged', this.get());

    if (session) {
      vscode.window.showInformationMessage(
        `Welcome back ${session.account.label}`
      );
    }
  };

  public async getSession(): Promise<vscode.AuthenticationSession | undefined> {
    const session = await vscode.authentication.getSession("oh-my-hooks", []);
    this._session = session || null;
    return session;
  }

  public async forceSession(): Promise<vscode.AuthenticationSession> {
    const session = await vscode.authentication.getSession("oh-my-hooks", [], {
      createIfNone: true,
    });
    this._session = session;

    return session;
  }

  public clearSessionAndEmit() {
    this._session = null;
    this._webhooks = [];
    this.emit('statusChanged', this.get());
  }

  // Reread the existing VS Code authentication session without prompting for sign-in.
  public async refreshSession(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession("oh-my-hooks", []);
      this._session = session || null;
    } catch {
      this._session = null;
    }
  }

  // Force-push the current state to the webview.
  public emitStatus(): void {
    this.emit('statusChanged', this.get());
  }

  // Enter guest mode. A single placeholder webhook entry is created up-front
  // (same Webhook shape as an authed persistent webhook, but with id = "").
  // Entering a port and clicking Connect causes the server to issue an id
  // (setGuestWebhookId). Disconnect clears the id but keeps the entry
  // (clearGuestWebhookId).
  public enterGuestMode(): void {
    this._isGuestMode = true;
    this._webhooks = [{
      id: "",
      enabled: true,
      destinationUrls: [],
      connection: 'disconnected',
      localPort: null,
      isAnonymous: true,
    }];
    void this.setGuestModePreference(true);
    this.emit('statusChanged', this.get());
  }

  public exitGuestMode(): void {
    this._isGuestMode = false;
    this._webhooks = [];
    void this.setGuestModePreference(false);
    this.emit('statusChanged', this.get());
  }

  public getGuestModePreference(): boolean {
    if (!this._context) {
      return false;
    }
    return this._context.globalState.get<boolean>(this.GUEST_MODE_PREF_KEY, false);
  }

  private async setGuestModePreference(value: boolean): Promise<void> {
    if (!this._context) {
      return;
    }
    await this._context.globalState.update(this.GUEST_MODE_PREF_KEY, value);
  }

  // Called before opening the WS to transition to 'connecting' and stash the port.
  public setGuestConnecting(port: number): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.connection = 'connecting';
    entry.localPort = port;
    this.emit('statusChanged', this.get());
  }

  // After the anon WS connects, write the server-issued webhook id into the
  // existing entry. The entry object itself is mutated (not replaced) to keep
  // React keys stable; only id / connection / localPort change.
  public setGuestWebhookId(webhookId: string, port: number): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.id = webhookId;
    entry.connection = 'connected';
    entry.localPort = port;
    this.emit('statusChanged', this.get());
  }

  // Called before invoking WS close to transition to 'disconnecting'.
  // The URL/id stay populated until the close actually completes, so the UI
  // can keep showing a spinner.
  public setGuestDisconnecting(): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.connection = 'disconnecting';
    this.emit('statusChanged', this.get());
  }

  // Called when the anon WS closes (= the server has already deleted the
  // webhook). Keep the entry; reset its id to empty.
  public clearGuestWebhookId(): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.id = "";
    entry.connection = 'disconnected';
    entry.localPort = null;
    this.emit('statusChanged', this.get());
  }

  public async fetchMisc() {
    if (!this._session) {
      return;
    }

    try {
      const miscResponse = await api.getMisc(this._session);
      this.emit('statusChanged', this.get());
      return miscResponse;
    } catch (err) {
      // On API failure, clear session to show sign-in button
      this.clearSessionAndEmit();
      throw err;
    }
  }

  public async fetchWebhooks() {
    if (!this._session) {
      return;
    }

    try {
      const webhooks = await api.getWebhooks(this._session);
      // Preserve existing connection state when refreshing webhooks
      const existingWebhookMap = new Map(this._webhooks.map(w => [w.id, w]));
      const persistent = webhooks.map((webhook) => {
        const existing = existingWebhookMap.get(webhook.id);
        return {
          ...webhook,
          connection: existing?.connection || 'disconnected',
          localPort: existing?.localPort || null,
        };
      });
      // Always keep one ephemeral placeholder at the top of the list; carry
      // over its existing state when present.
      const existingEphemeral = this._webhooks.find((w) => w.isEphemeral);
      const ephemeral = existingEphemeral || buildEphemeralPlaceholder();
      this._webhooks = [ephemeral, ...persistent];
      this.emit('statusChanged', this.get());
      return webhooks;
    } catch (err) {
      // On API failure, clear session to show sign-in button
      this.clearSessionAndEmit();
      throw err;
    }
  }

  // Called before opening the authed WS and sending subscribeEphemeral.
  public setEphemeralConnecting(port: number): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.connection = 'connecting';
    entry.localPort = port;
    this.emit('statusChanged', this.get());
  }

  // Apply the id received via ephemeralWebhookCreated.
  public setEphemeralWebhookId(webhookId: string, port: number): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.id = webhookId;
    entry.connection = 'connected';
    entry.localPort = port;
    // Set a future expiresAt so the UI badge logic classifies this entry as ephemeral.
    entry.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    this.emit('statusChanged', this.get());
  }

  public setEphemeralDisconnecting(): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.connection = 'disconnecting';
    this.emit('statusChanged', this.get());
  }

  // Once disconnect completes, clear the id and reset the entry to a placeholder.
  public clearEphemeralWebhookId(): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.id = "";
    entry.connection = 'disconnected';
    entry.localPort = null;
    entry.expiresAt = null;
    this.emit('statusChanged', this.get());
  }

  public async fetchAll() {
    return await Promise.all([this.fetchMisc(), this.fetchWebhooks()]);
  }

  public getWebhookById(webhookId: string): Webhook | undefined {
    return this._webhooks.find((webhook) => webhook.id === webhookId);
  }

  public async connectWebhook(webhookId: string, port: number): Promise<void> {
    // Guest mode has no session, so skip the session check.
    if (!this._isGuestMode) {
      const session = await this.getSession();
      if (!session) {
        return;
      }
    }

    const webhook = this._webhooks.find((webhook) => webhook.id === webhookId);
    if (!webhook) {
      return;
    }

    webhook.connection = 'connecting';
    webhook.localPort = port;

    // Only persist the port for authenticated users; guest webhooks are throwaway.
    if (!this._isGuestMode) {
      await this.saveWebhookPort(webhookId, port);
    }

    this.emit('statusChanged', this.get());
  }

  public async setWebhookConnected(webhookId: string): Promise<void> {
    const webhook = this._webhooks.find((webhook) => webhook.id === webhookId);
    if (!webhook) {
      return;
    }

    webhook.connection = 'connected';
    this.emit('statusChanged', this.get());
  }

  public async disconnectWebhook(webhookId: string) {
    // Guest mode has no session, so skip the session check.
    if (!this._isGuestMode) {
      const session = await this.getSession();
      if (!session) {
        return;
      }
    }

    const webhook = this._webhooks.find((webhook) => webhook.id === webhookId);
    if (!webhook) {
      return;
    }

    webhook.connection = 'disconnected';
    webhook.localPort = null;
    this.emit('statusChanged', this.get());
  }

  private async saveWebhookPort(webhookId: string, port: number): Promise<void> {
    if (!this._context) {
      return;
    }

    const ports = this._context.globalState.get<Record<string, number>>(this.PORT_STORAGE_KEY, {});
    ports[webhookId] = port;
    await this._context.globalState.update(this.PORT_STORAGE_KEY, ports);
  }

  public getWebhookPort(webhookId: string): number | null {
    if (!this._context) {
      return null;
    }

    const ports = this._context.globalState.get<Record<string, number>>(this.PORT_STORAGE_KEY, {});
    return ports[webhookId] || null;
  }
}
