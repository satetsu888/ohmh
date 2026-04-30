import * as vscode from "vscode";
import * as api from "./api";
import events from "events";

export type Status = {
  hasSession: boolean;
  isGuestMode: boolean;
  webhooks: Webhook[];
};

export type Webhook = api.Webhook & {
  // connecting: WS open / subscribe / id 払い出し待ち
  // disconnecting: WS close 待ち (UI 上はまだ URL が見えている = 実状態を反映)
  connection: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
  localPort: number | null;
  // anon webhook であることを表す。webhook.id が "" の場合は接続前のプレースホルダ。
  isAnonymous?: boolean;
  // authed ephemeral webhook (一覧の最初に常時 1 件)。Connect で id 払い出し、Disconnect で消える。
  isEphemeral?: boolean;
};

export const buildEphemeralPlaceholder = (): Webhook => ({
  id: "",
  enabled: true,
  destinationUrls: [],
  expiresAt: null,
  isCustomSubdomain: false,
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

  // 既存の VS Code 認証状態を再読込 (sign-in を促さない)
  public async refreshSession(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession("oh-my-hooks", []);
      this._session = session || null;
    } catch {
      this._session = null;
    }
  }

  // 現在の状態を強制的に webview へ通知
  public emitStatus(): void {
    this.emit('statusChanged', this.get());
  }

  // Guest mode を有効化。webhook entry は最初から 1 つ用意する (id 未払い出し状態)。
  // 認証ユーザの persistent webhook と完全に同じ Webhook 型で、id が "" の状態。
  // port 入力 + Connect で id がサーバから払い出される (setGuestWebhookId)。
  // Disconnect で id がクリアされるが entry 自体は残る (clearGuestWebhookId)。
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

  // 接続開始 (WS 開く前) に呼ばれて 'connecting' に遷移。port も先に保持。
  public setGuestConnecting(port: number): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.connection = 'connecting';
    entry.localPort = port;
    this.emit('statusChanged', this.get());
  }

  // anon WS 接続後、サーバから払い出された webhook id を既存の entry に書き込む。
  // entry そのものは差し替えず (key 安定のため)、id / connection / localPort のみ更新。
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

  // 接続切断開始 (WS close を呼ぶ前) に呼ばれて 'disconnecting' に遷移。
  // URL/id はまだ生きているので保持。実際の close 完了まで spinner 表示。
  public setGuestDisconnecting(): void {
    if (!this._isGuestMode || this._webhooks.length === 0) {
      return;
    }
    const entry = this._webhooks[0];
    entry.connection = 'disconnecting';
    this.emit('statusChanged', this.get());
  }

  // anon WS が閉じた (= サーバ側で webhook 削除) 時。entry は残し、id を空に戻す。
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
      // ephemeral placeholder は常に先頭に 1 件保持。既存の状態があれば引き継ぐ。
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

  // authed ephemeral 接続開始 (WS open + subscribeEphemeral 要求の前に呼ぶ)
  public setEphemeralConnecting(port: number): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.connection = 'connecting';
    entry.localPort = port;
    this.emit('statusChanged', this.get());
  }

  // ephemeralWebhookCreated を受けて id を反映
  public setEphemeralWebhookId(webhookId: string, port: number): void {
    const entry = this._webhooks.find((w) => w.isEphemeral);
    if (!entry) {
      return;
    }
    entry.id = webhookId;
    entry.connection = 'connected';
    entry.localPort = port;
    // ephemeral として表示するため expiresAt を未来日付に (UI のバッジ判定用)
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

  // 切断完了で id をクリアして placeholder に戻す
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
    // Guest mode は session を持たないので session チェックをスキップ
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

    // 認証ユーザのみポート設定を永続化 (guest webhook は使い捨てなので保存しない)
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
    // Guest mode は session を持たないので session チェックをスキップ
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
