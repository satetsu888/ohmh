import { useState, useMemo } from "react";

/**
 * Hover 状態を宣言的に扱うための hook。
 * `props` は対象要素にスプレッドして使う。`hovered` は state-driven style に流す。
 */
export const useHover = () => {
  const [hovered, setHovered] = useState(false);
  const props = useMemo(
    () => ({
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    }),
    []
  );
  return { hovered, props };
};
