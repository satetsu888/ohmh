import { CSSProperties, MouseEvent } from "react";
import { useHover } from "../../hooks/useHover";

type Props = {
  /** codicon-xxx のサフィックス。空文字なら不可視 */
  icon: string;
  title?: string;
  /** 無効状態の場合は click が呼ばれず、hover も発火しない */
  disabled?: boolean;
  /** hover していない時の透明度 (default 0.7) */
  baseOpacity?: number;
  /** disabled 時の透明度 (default 0.3) */
  disabledOpacity?: number;
  fontSize?: number;
  ariaLabel?: string;
  onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
  /** 余分な拡張用 (cursor などを上書きしたい時) */
  style?: CSSProperties;
  /** ローディングスピナーとして回す */
  spinning?: boolean;
  /** 親が web component の slot を期待する場合に使う (例: VSCodeTextField の slot="end") */
  slot?: string;
};

/**
 * codicon を使うアイコンボタン。hover 状態は useHover で取って、style に宣言的に流し込む。
 * 旧コードで onMouseEnter / onMouseLeave 内で imperative に style を書き換えていた処理を置き換える。
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
