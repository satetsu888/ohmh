import { useEffect } from "react";

type IncomingMessage = { type: string; args?: Record<string, unknown> };

/**
 * Subscribes to postMessage events from the extension.
 * The webview runtime delivers event.data as either a JSON string or an object,
 * so this handles both shapes.
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
