import { CSSProperties, MouseEvent } from "react";
import { useHover } from "../../hooks/useHover";

type Props = {
  /** codicon-xxx suffix; an empty string renders the button invisibly. */
  icon: string;
  title?: string;
  /** When true, click and hover are both inert. */
  disabled?: boolean;
  /** Opacity when not hovered (default 0.7). */
  baseOpacity?: number;
  /** Opacity when disabled (default 0.3). */
  disabledOpacity?: number;
  fontSize?: number;
  ariaLabel?: string;
  onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
  /** Extra style overrides (e.g. for cursor). */
  style?: CSSProperties;
  /** Render as a spinning loading indicator. */
  spinning?: boolean;
  /** Set when the parent web component expects a `slot` (e.g. VSCodeTextField's slot="end"). */
  slot?: string;
};

/**
 * Codicon-based icon button. Hover state is read via useHover and applied
 * declaratively to `style`, replacing the previous imperative
 * onMouseEnter / onMouseLeave style mutations.
 */
export const IconButton = ({
  icon,
  title,
  disabled = false,
  baseOpacity = 0.7,
  disabledOpacity = 0.3,
  fontSize,
  ariaLabel,
  onClick,
  style,
  spinning = false,
  slot,
}: Props) => {
  const { hovered, props: hoverProps } = useHover();
  const opacity = disabled
    ? disabledOpacity
    : hovered
    ? 1
    : baseOpacity;
  const transform = !disabled && hovered ? "scale(1.1)" : "scale(1)";
  const background = !disabled && hovered
    ? "var(--vscode-toolbar-hoverBackground)"
    : "transparent";

  return (
    <span
      role="button"
      slot={slot}
      aria-label={ariaLabel ?? title}
      title={title}
      className={`codicon ${icon ? `codicon-${icon}` : ""} ${spinning ? "oh-my-hooks-spin" : ""}`}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
      }}
      {...hoverProps}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "2px",
        borderRadius: "3px",
        transition: "all 0.2s ease",
        opacity,
        transform,
        backgroundColor: background,
        visibility: icon ? "visible" : "hidden",
        fontSize,
        display: "inline-block",
        ...style,
      }}
    />
  );
};
