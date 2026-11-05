/** Ghép className, bỏ giá trị falsy. */
export const cn = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");
