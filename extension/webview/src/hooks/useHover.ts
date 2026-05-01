import { useState, useMemo } from "react";

/**
 * Hook for tracking hover state declaratively. Spread `props` onto the target
 * element and feed `hovered` into the element's style.
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
