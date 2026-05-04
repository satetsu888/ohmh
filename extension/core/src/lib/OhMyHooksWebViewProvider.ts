import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

class OhMyHooksWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ohmh-webview";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _messageHandler: (message: any) => Promise<void>) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getWebviewContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this._messageHandler(data);
    });
  }

  public postMessage(message: string) {
    this._view?.webview.postMessage(message);
  }

  private getWebviewContent(webview: vscode.Webview) {
    const webviewUri = this.getUri(webview, this._extensionUri, [
      "dist",
      "webview.js",
    ]);
    const codiconsUri = this.getUri(webview, this._extensionUri, [
      "webview",
      "node_modules",
      "@vscode",
      "codicons",
      "dist",
      "codicon.css",
    ]);
    const nonce = this.getNonce();
    // style-src includes 'unsafe-inline' to allow React inline `style={{...}}` attributes.
    // Per CSP3, when a nonce is present 'unsafe-inline' is ignored for <style> elements
    // (covered by the nonce here) but still applies to HTML style attributes — which is
    // exactly the split we want.
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="${csp}">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="${codiconsUri}" rel="stylesheet" />
          <style nonce="${nonce}">${this.getGlobalStyles()}</style>
          <title>Oh My Hooks</title>
      </head>
      <body>
        <div id="app"></div>
        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
      </body>
      </html>`;
  }

  // Global CSS for the webview.
  // - `@keyframes` and shadow-DOM `::part()` selectors cannot be expressed
  //   inline, so they are gathered here.
  // - Allowed via the nonce in the CSP `style-src` directive.
  private getGlobalStyles(): string {
    return `
      @keyframes oh-my-hooks-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .oh-my-hooks-spin {
        animation: oh-my-hooks-spin 1s linear infinite;
      }

      /* Fit VSCodeTextField into the table cell with no gap. */
      .oh-my-hooks-port-input {
        --input-padding-horizontal: 8px !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .oh-my-hooks-port-input::part(root) {
        margin: 0 !important;
        width: 100% !important;
      }
      .oh-my-hooks-port-input::part(control) {
        padding-left: 8px !important;
        width: 100% !important;
      }
      .oh-my-hooks-port-input [slot="end"] {
        z-index: 10;
        position: relative;
      }

      /* Remove horizontal padding from the port cell. */
      vscode-table-cell.oh-my-hooks-no-padding {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
    `;
  }

  private getUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    pathList: string[]
  ) {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
  }

  private getNonce(): string {
    return randomBytes(16).toString("base64url");
  }
}

export default OhMyHooksWebViewProvider;