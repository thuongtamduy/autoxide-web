import { expect, test } from "@playwright/test";
import { expectMoneyOnOneLine, expectNoHorizontalScroll, expectNoOrphanCard } from "./helpers";

// Bốn kiểu giao diện (`AUTOXIDE_STOREFRONT_THEME`): `playwright.config.ts` chạy thêm ba bản của website
// ở cổng 3201–3203 với kiểu market, minimal, luxe. Mỗi kiểu: trang chủ, danh mục, sản phẩm không cuộn
// ngang, tiền không bẻ dòng, không thẻ lẻ, và đúng nét riêng của bảng `Style*`.

const VARIANTS = [
  { name: "default", port: 3200 },
  { name: "market", port: 3201 },
  { name: "minimal", port: 3202 },
  { name: "luxe", port: 3203 },
] as const;

for (const variant of VARIANTS) {
  for (const width of [390, 1440]) {
    test(`kiểu ${variant.name} ở ${width}px: trang chủ, danh mục, sản phẩm`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const base = `http://localhost:${variant.port}`;
      for (const path of ["/", "/danh-muc/bep", "/san-pham/chao-gang", "/khuyen-mai"]) {
        await page.goto(base + path);
        await expect(page.locator("html")).toHaveAttribute("data-variant", variant.name);
        await expectNoHorizontalScroll(page);
        await expectMoneyOnOneLine(page);
      }
      await page.goto(`${base}/`);
      await expectNoOrphanCard(page, ".best-grid");
      await page.goto(`${base}/san-pham/chao-gang`);
      const style = await page.evaluate(() => {
        const button = document.querySelector<HTMLElement>(".pp-add, .pp-buybar .btn.pri");
        const title = document.querySelector<HTMLElement>(".pp-title");
        const card = document.querySelector<HTMLElement>(".pp-together .pcard");
        return {
          radius: button ? getComputedStyle(button).borderTopLeftRadius : "",
          font: title ? getComputedStyle(title).fontFamily : "",
          cardBorder: card ? getComputedStyle(card).borderTopWidth : "",
        };
      });
      if (variant.name === "luxe") {
        expect(style.radius).toBe("0px");
        expect(style.font).toContain("Cormorant Garamond");
      }
      if (variant.name === "minimal") expect(style.radius).toBe("999px");
      if (variant.name === "market") {
        expect(style.radius).toBe("8px");
        expect(style.cardBorder).toBe("1px");
      }
      if (variant.name === "default") expect(style.radius).toBe("12px");
    });
  }
}
