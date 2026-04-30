import { useEffect } from "react";

type IncomingMessage = { type: string; args?: Record<string, unknown> };

/**
 * extension からの postMessage を購読する hook。
 * webview ランタイムは event.data に「文字列(JSON)」or「オブジェクト」のどちらでも
 * 渡してくるので、両方を吸収する。
 */
export const useExtensionMessage = (handler: (msg: IncomingMessage) => void) => {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const raw = event.data;
      let msg: IncomingMessage | null = null;
      if (typeof raw === "string") {
        try {
          msg = JSON.parse(raw) as IncomingMessage;
        } catch {
          return;
        }
      } else if (raw && typeof raw === "object") {
        msg = raw as IncomingMessage;
      }
      if (msg) {
        handler(msg);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handler]);
};
