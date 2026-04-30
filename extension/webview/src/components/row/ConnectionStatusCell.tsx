import { CSSProperties } from "react";
import { VscodeTableCell } from "@vscode-elements/react-elements";
import { Webhook } from "../../../../core/src/stateStore";

type Props = { connection: Webhook["connection"] };

const DOT_BASE: CSSProperties = {
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: "50%",
  margin: "0 auto",
  boxSizing: "border-box",
};

const labelOf: Record<Webhook["connection"], string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  connecting: "Connecting...",
  disconnecting: "Disconnecting...",
};

const styleOf = (connection: Webhook["connection"]): CSSProperties => {
  switch (connection) {
    case "connected":
      return { ...DOT_BASE, backgroundColor: "#10b981" };
    case "disconnected":
      return { ...DOT_BASE, border: "2px solid #6b7280", backgroundColor: "transparent" };
    case "connecting":
    case "disconnecting":
      return {
        ...DOT_BASE,
        border: "2px solid #e5e7eb",
        borderTopColor: "#3b82f6",
      };
  }
};

/** 接続状態を表す丸いインジケータ。connecting/disconnecting は spinner として回転。 */
export const ConnectionStatusCell = ({ connection }: Props) => {
  const isSpinning = connection === "connecting" || connection === "disconnecting";
  return (
    <VscodeTableCell>
      <div style={{ textAlign: "center", verticalAlign: "middle" }}>
        <div
          className={isSpinning ? "oh-my-hooks-spin" : undefined}
          style={styleOf(connection)}
          title={labelOf[connection]}
        />
      </div>
    </VscodeTableCell>
  );
};
