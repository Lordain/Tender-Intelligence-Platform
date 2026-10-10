/** First page, last page, and a small window around the current page — with "ellipsis" markers for any gap — so a jump to page 12 of 40 doesn't require 11 clicks on "下一页". */
export function buildPageWindow(current: number, total: number): (number | "ellipsis")[] {
  const radius = 1;
  const pages = new Set<number>([1, total, current]);
  for (let i = current - radius; i <= current + radius; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}
