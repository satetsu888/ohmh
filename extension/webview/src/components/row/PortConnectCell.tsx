import { useId } from "react";
import { VscodeTableCell } from "@vscode-elements/react-elements";
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { Webhook } from "../../../../core/src/stateStore";
import { IconButton } from "../common/IconButton";

type Props = {
  connection: Webhook["connection"];
  port: number | null;
  onPortChange: (port: number | null) => void;
  onConnect: (port: number) => void;
  onDisconnect: () => void;
};

const isTransitional = (c: Webhook["connection"]) =>
  c === "connecting" || c === "disconnecting";

/** Single cell for entering the port and triggering Connect / Disconnect. The icon reflects the current state. */
export const PortConnectCell = ({
  connection,
  port,
  onPortChange,
  onConnect,
  onDisconnect,
}: Props) => {
  const inputId = `port-input-${useId()}`;

  const portReady = port !== null && !Number.isNaN(port);
  const editable = connection === "disconnected";
  const transitional = isTransitional(connection);

  // Decide which icon and action to render based on connection state.
  const variant = ((): {
    icon: string;
    title: string;
    disabled: boolean;
    spinning: boolean;
    action?: () => void;
  } => {
    if (transitional) {
      return {
        icon: "loading",
        title: connection === "connecting" ? "Connecting..." : "Disconnecting...",
        disabled: true,
        spinning: true,
      };
    }
    if (connection === "connected") {
      return {
        icon: "close",
        title: "Disconnect",
        disabled: false,
        spinning: false,
        action: onDisconnect,
      };
    }
    // disconnected.
    return {
      icon: portReady ? "debug-disconnect" : "",
      title: portReady ? "Connect" : "Enter a port to connect",
      disabled: !portReady,
      spinning: false,
      action: portReady ? () => onConnect(port!) : undefined,
    };
  })();

  return (
    <VscodeTableCell className="oh-my-hooks-no-padding">
      <VSCodeTextField
        id={inputId}
        className="oh-my-hooks-port-input"
        value={portReady ? String(port) : ""}
        style={{ width: "100%" }}
        onInput={(ev) => {
          if (!editable) {
            ev.preventDefault();
            return;
          }
          const target = ev.target as HTMLInputElement;
          const parsed = parseInt(target.value, 10);
          onPortChange(Number.isNaN(parsed) ? null : parsed);
        }}
      >
        <IconButton
          slot="end"
          icon={variant.icon}
          title={variant.title}
          disabled={variant.disabled}
          spinning={variant.spinning}
          onClick={(e) => {
            e.stopPropagation();
            // Blur the port input if it currently has focus, to prevent rapid double-clicks.
            const active = document.activeElement as HTMLElement | null;
            if (active && active.id === inputId) {
              active.blur();
            }
            variant.action?.();
          }}
        />
      </VSCodeTextField>
    </VscodeTableCell>
  );
};
