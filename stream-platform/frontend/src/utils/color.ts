/**
 * 十六进制色 → 带透明度的 rgba。
 * 用于把语义色调成淡色底/描边：#2f54eb + .1 → rgba(47,84,235,.1)
 */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
