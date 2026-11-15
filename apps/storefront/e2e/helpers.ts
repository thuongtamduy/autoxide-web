import { expect, type Page } from "@playwright/test";

export const CORE = "http://127.0.0.1:4012";

/** Trang không có dải cuộn ngang (luật bố cục cân đối, mục 7 của `ui-design.md`). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Không số tiền nào bị bẻ dòng: mỗi `.price` chỉ cao một dòng chữ. */
export async function expectMoneyOnOneLine(page: Page) {
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".price, .was")]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 24;
        return (
          el.getClientRects().length > 1 || el.getBoundingClientRect().height > lineHeight * 1.5
        );
      })
      .map((el) => el.textContent),
  );
  expect(broken).toEqual([]);
}

/** Lưới có số thẻ cố định không để một thẻ lẻ ở hàng cuối. */
export async function expectNoOrphanCard(page: Page, selector: string) {
  const rows = await page.evaluate((sel) => {
    const grid = document.querySelector(sel);
    if (!grid) return [];
    const tops = [...grid.children].map((child) => Math.round(child.getBoundingClientRect().top));
    const counts = new Map<number, number>();
    for (const top of tops) counts.set(top, (counts.get(top) ?? 0) + 1);
    return [...counts.values()];
  }, selector);
  expect(rows.length).toBeGreaterThan(0);
  // Mọi hàng đủ thẻ như hàng đầu.
  expect(rows.every((count) => count === rows[0])).toBe(true);
}
