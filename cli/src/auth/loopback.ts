import http from "node:http";
import type { AddressInfo } from "node:net";

// CLI redirect 用の loopback http サーバ。53682〜53690 を順に試して bind に成功したものを使う。
// front/app/services/oauth2.server.ts の buildCliRedirectUris() と範囲が一致している必要がある。

const PORT_START = 53682;
const PORT_END = 53690;

export type LoopbackResult = {
  code: string;
  state: string | null;
};

export type LoopbackHandle = {
  port: number;
  redirectUri: string;
  // ブラウザからの callback を 1 回受け取った時点で resolve する。
  waitForCallback: (timeoutMs: number) => Promise<LoopbackResult>;
  close: () => void;
};

const tryBind = (port: number, server: http.Server): Promise<boolean> => {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListen);
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(false);
      } else {
        resolve(false);
      }
    };
    const onListen = () => {
      server.removeListener("error", onError);
      resolve(true);
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(port, "127.0.0.1");
  });
};

export const startLoopback = async (): Promise<LoopbackHandle> => {
  let pendingResolve: ((r: LoopbackResult) => void) | null = null;
  let pendingReject: ((e: Error) => void) | null = null;

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("bad request");
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) {
      res.statusCode = 400;
      res.end("missing code");
      if (pendingReject) {
        pendingReject(new Error("OAuth callback missing code"));
        pendingResolve = pendingReject = null;
      }
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<!doctype html><meta charset="utf-8"><title>ohmh signed in</title>` +
        `<body style="font-family:system-ui;padding:40px"><h1>Signed in to ohmh</h1>` +
        `<p>You can close this tab and return to your terminal.</p></body>`,
    );
    if (pendingResolve) {
      pendingResolve({ code, state });
      pendingResolve = pendingReject = null;
    }
  });

  let bound = false;
  let listenPort = -1;
  for (let port = PORT_START; port <= PORT_END; port++) {
    // 各試行で server をリスナとして再利用する。失敗時は次のポートへ。
    const ok = await tryBind(port, server);
    if (ok) {
      bound = true;
      listenPort = port;
      break;
    }
  }
  if (!bound) {
    server.close();
    throw new Error(
      `failed to bind any loopback port in range ${PORT_START}-${PORT_END}. ` +
        `Another ohmh login may already be running.`,
    );
  }
  // AddressInfo から実際のポートを取得 (上で listenPort と同じはずだが念のため)
  const address = server.address() as AddressInfo | null;
  if (address && typeof address === "object") {
    listenPort = address.port;
  }

  return {
    port: listenPort,
    redirectUri: `http://127.0.0.1:${listenPort}/callback`,
    waitForCallback: (timeoutMs: number) =>
      new Promise<LoopbackResult>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        const timer = setTimeout(() => {
          if (pendingReject) {
            pendingReject(new Error("Sign in timed out. Please run `ohmh login` again."));
            pendingResolve = pendingReject = null;
          }
        }, timeoutMs);
        // resolve / reject 後にタイマー解除
        const wrap = <T>(orig: (v: T) => void) => (v: T) => {
          clearTimeout(timer);
          orig(v);
        };
        const wrappedResolve = wrap(resolve);
        const wrappedReject = wrap(reject);
        pendingResolve = wrappedResolve;
        pendingReject = wrappedReject;
      }),
    close: () => server.close(),
  };
};
