import type { CSSProperties } from "react";

/** animation-delay so le cho phần tử thứ `index`: base + index * step (ms). */
export const stagger = (index: number, stepMs: number, baseMs = 0): CSSProperties => ({
  animationDelay: `${baseMs + index * stepMs}ms`,
});
