import { expect, test } from "@playwright/test";
import {
  CORE,
  expectMoneyOnOneLine,
  expectNoHorizontalScroll,
  expectNoOrphanCard,
} from "./helpers";

// Trang thương mại dùng dữ liệu mẫu (W-029): danh mục, sản phẩm, khuyến mại, livestream, gợi ý tìm.

test.beforeEach(async ({ request, context }) => {
  await request.post(`${CORE}/__storefront/reset`);
  await context.clearCookies();
});

test("danh mục: lọc, sắp xếp, bỏ lọc, chia trang", async ({ page }) => {
  await page.goto("/danh-muc");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tất cả sản phẩm");
  await expect(page.locator(".cat-grid .pcard")).toHaveCount(12);
  await expectNoOrphanCard(page, ".cat-grid");
  await expect(page.locator(".cat-pages")).toContainText("Đang xem 1–12 trên 13");
  await page.getByRole("link", { name: "Trang sau" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.locator(".cat-grid .pcard")).toHaveCount(1);
  await expect(page.locator(".cat-grid")).toContainText("Người bán: Khăn Bông Hạ Long");

  await page.goto("/danh-muc");
  await page.getByRole("checkbox", { name: /^Gỗ/ }).check();
  await expect(page).toHaveURL(/material=wood/);
  await expect(page.locator(".cat-count")).toHaveText("4 sản phẩm");
  await page.getByRole("combobox", { name: "Sắp xếp sản phẩm" }).selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page.locator(".cat-grid .pc-name").first()).toHaveText("Thớt gỗ me tây 25 cm");
  // Trang đã lọc không vào chỉ mục.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("link", { name: "Bỏ lọc Gỗ" }).click();
  await expect(page).not.toHaveURL(/material=/);
  await expect(page.locator(".cat-count")).toHaveText("13 sản phẩm");

  // Danh mục sản phẩm khác danh mục bài viết; slug lạ là 404.
  await page.goto("/danh-muc/bep");
  await expect(page.getByRole("navigation", { name: "Danh mục con" })).toContainText("Chảo");
  const missing = await page.goto("/danh-muc/chon-mua");
  expect(missing?.status()).toBe(404);
});

test("sản phẩm: chọn cỡ, nhận tại cửa hàng hết hàng, thêm vào giỏ", async ({ page }) => {
  await page.goto("/san-pham/chao-gang");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chảo gang");
  // Giá niêm yết và giá với mã (không trình bày như giá đã giảm sẵn), flash sale sắp tới có giá tham chiếu.
  await expect(page.locator(".pp-price")).toContainText("690.000 ₫");
  await expect(page.locator(".pp-price")).toContainText("Còn 621.000 ₫ với mã BEPMOC10");
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  expect(jsonLd["@type"]).toBe("Product");
  expect(jsonLd.offers).toHaveLength(3);
  await page.locator("label.pp-size", { hasText: "28 cm" }).click();
  await expect(page.getByRole("radio", { name: /28 cm/ })).toBeChecked();
  await expect(page).toHaveURL(/sku=CG28/);
  // CN Quận 3 hết cỡ 28 cm: không nhận tại quầy được, mở danh sách cửa hàng khác.
  await page.getByText("Nhận tại CN Quận 3 — miễn phí").click();
  await expect(page.getByRole("status")).toContainText("không có đủ hàng");
  await expect(page.locator(".pp-storelist")).toContainText("CN Cầu Giấy");
  await page.getByRole("button", { name: "Thêm một" }).click();
  await page.locator(".pp-add").click();
  await expect(page.getByRole("status")).toHaveText("Đã thêm 2 Chảo gang 28 cm vào giỏ");
  await expect(page.locator(".hdr-cart")).toHaveAccessibleName("Giỏ hàng, 2 món");
  // Thông tin người bán và hàng hoá theo luật: để trống dữ liệu thật.
  await expect(page.locator(".pp-legal")).toContainText("[MÃ SỐ THUẾ]");
  await page.getByRole("tab", { name: "Thông số và nhãn hàng hoá" }).click();
  await expect(page.locator(".pp-spec")).toContainText("Xuất xứ");
  await expect(page.locator(".pp-spec")).toContainText("8930000000033");
});

test("sản phẩm: lọc đánh giá, hữu ích, hỏi đáp", async ({ page }) => {
  await page.goto("/san-pham/chao-gang#reviews");
  const reviews = page.locator("#reviews");
  await expect(reviews.locator("article")).toHaveCount(5);
  await reviews.getByRole("button", { name: "Lọc đánh giá 2 sao, 2 đánh giá" }).click();
  await expect(reviews.locator("article")).toHaveCount(1);
  await expect(reviews.locator("article")).toContainText("Giao chậm hơn hẹn 2 ngày");
  await expect(reviews.locator("article")).toContainText("Bếp Mộc trả lời:");
  await reviews.getByRole("button", { name: "Xoá lọc" }).click();
  await reviews.getByRole("button", { name: "Có ảnh" }).click();
  await expect(reviews.locator("article")).toHaveCount(3);
  await reviews.getByRole("combobox", { name: "Lọc theo lựa chọn đã mua" }).selectOption("CG28");
  await expect(reviews.locator("article")).toHaveCount(2);
  await reviews.getByRole("button", { name: "Hữu ích (14)" }).click();
  await expect(reviews.getByRole("button", { name: "Hữu ích (15)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Tên người mua rút gọn.
  await expect(reviews).toContainText("Ngọc Diệp P.");
  await expect(reviews).not.toContainText("Phạm Ngọc Diệp");

  await page.getByRole("tab", { name: /Hỏi đáp/ }).click();
  const qa = page.locator("#qa");
  await qa.getByRole("searchbox", { name: "Tìm câu hỏi" }).fill("hong ngoai");
  await expect(qa.locator("article")).toHaveCount(1);
  await expect(qa).toContainText("Cửa hàng");
});

test("khuyến mại: flash sale đếm ngược, mã giảm giá, thông báo Sở Công Thương", async ({
  page,
}) => {
  await page.goto("/khuyen-mai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Khuyến mại");
  await expect(page.getByRole("timer")).toContainText("Bắt đầu sau");
  await expect(page.locator(".dl-grid .pcard")).toHaveCount(4);
  await expect(page.locator(".dl-grid")).toContainText("345.000 ₫");
  await expect(page.locator(".dl-grid")).toContainText("−50%");
  await expect(page.locator(".coupon")).toContainText("BEPMOC10");
  await expect(page.locator(".dl-legal")).toContainText("TT 39/2025/TT-BCT");
  await expect(page.locator(".dl-legal")).toContainText("TB-KM-0000/2026 (mẫu)");
});

test("livestream: phiên đang phát, thêm sản phẩm đang ghim, lịch phát", async ({ page }) => {
  await page.goto("/livestream");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mở hộp bộ dao 3 món");
  await expect(page.locator(".lv-row.now")).toContainText("Thớt gỗ me tây 35 cm");
  await page.getByRole("button", { name: "Thêm Thớt gỗ me tây 35 cm vào giỏ" }).click();
  await expect(page.getByRole("status")).toContainText("ghi nhận mua từ phiên này");
  await expect(page.locator(".lv-legal")).toContainText("người tiếp thị liên kết");
  await page.getByRole("link", { name: /Chảo gang cho bếp từ/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chảo gang cho bếp từ");
  await expect(page.getByRole("timer")).toContainText("Bắt đầu sau");
});

test("gợi ý tìm ở đầu trang: gõ không dấu, chọn bằng bàn phím", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: "Tìm sản phẩm, bài viết, cửa hàng" });
  await box.fill("chao");
  const list = page.getByRole("listbox", { name: "Gợi ý tìm kiếm" });
  await expect(list.getByRole("option", { name: /Chảo gang.*690\.000/ })).toBeVisible();
  await expect(list).toContainText("trong Chảo");
  await expect(list).toContainText("Chảo gang, chảo inox hay chống dính");
  await box.press("ArrowDown");
  await box.press("ArrowDown");
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
  await box.fill("thot go");
  await expect(list.getByRole("option", { name: /Thớt gỗ me tây 35 cm/ })).toBeVisible();
  await list.getByRole("option", { name: /Thớt gỗ me tây 35 cm/ }).click();
  await expect(page).toHaveURL(/\/san-pham\/thot-go-me-tay-35$/);
  await box.press("Escape");
});

test("trang thương mại tiếng Anh: slug theo ngôn ngữ, hreflang", async ({ page }) => {
  await page.goto("/en/san-pham/chao-gang-en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cast iron pan");
  await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveAttribute(
    "href",
    "http://localhost:3200/san-pham/chao-gang",
  );
  await page.goto("/en/danh-muc/bep-en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kitchen");
  await expectNoHorizontalScroll(page);
  await expectMoneyOnOneLine(page);
});
