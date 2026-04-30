import { useEffect, useState } from "react";
import { GetWebhookPortMessage } from "../messages";
import { VSCodeApi } from "../types/vscode";
import { useExtensionMessage } from "./useExtensionMessage";

const DEFAULT_PORT = 3000;

/**
 * 認証ユーザの永続 webhook の保存済み port を extension から取得する。
 * - skip=true (例: anonymous webhook) の時は問い合わせず、外部から渡された initial port を保持する。
 * - 取得した値は呼び出し元の state ではなく、この hook が持つ state として返す。
 */
export const useSavedPort = (
  vscode: VSCodeApi,
  webhookId: string,
  options: { skip?: boolean; fallback?: number; initial?: number | null } = {}
) => {
  const { skip = false, fallback = DEFAULT_PORT, initial } = options;
  const [port, setPort] = useState<number | null>(initial ?? fallback);

  // initial / skip の変化に追従
  useEffect(() => {
    if (skip) {
      if (initial !== undefined && initial !== null) {
        setPort(initial);
      }
      return;
    }
    if (!webhookId) {
      return;
    }
    vscode.postMessage(GetWebhookPortMessage(webhookId));
  }, [vscode, webhookId, skip, initial]);

  useExtensionMessage((msg) => {
    if (msg.type !== "webhookPortResponse") {return;}
    if (msg.args?.webhookId !== webhookId) {return;}
    const saved = msg.args?.port;
    if (typeof saved === "number") {
      setPort(saved);
    } else {
      setPort(fallback);
    }
  });

  return [port, setPort] as const;
};
