import { expect, test } from "@playwright/test";
import {
  CORE,
  expectMoneyOnOneLine,
  expectNoHorizontalScroll,
  expectNoOrphanCard,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__storefront/reset`);
});

test("trang chủ tiếng Việt: menu thật của core, khối mẫu, bài viết thật", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Dụng cụ bếp bền, nấu ngon mỗi ngày",
  );
  // Menu `main` của core giả: danh mục "Chọn mua" (content.term) và lối vào "Khuyến mại".
  const nav = page.getByRole("navigation", { name: "Danh mục" });
  await expect(nav.getByRole("link", { name: "Chọn mua" })).toHaveAttribute(
    "href",
    "/blog/category/chon-mua",
  );
  await expect(nav.getByRole("link", { name: /Khuyến mại/ })).toBeVisible();
  // Chân trang: menu `footer` của core, thông tin pháp lý để trống.
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Về chúng tôi" })).toBeVisible();
  await expect(footer).toContainText("Mã số thuế [MÃ SỐ THUẾ]");
  // Bài viết thật mới nhất.
  await expect(
    page.getByRole("link", { name: /Chảo gang, chảo inox hay chống dính/ }),
  ).toBeVisible();
  // Dữ liệu mẫu có dải thông báo và dấu "mẫu".
  await expect(page.getByRole("note").first()).toContainText("dữ liệu mẫu");
  await expect(
    page.locator("h2", { hasText: "Bán chạy tuần này" }).locator(".smark"),
  ).toBeVisible();
  // SEO.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^http:\/\/localhost:3200\/?$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    "http://localhost:3200/en",
  );
  await expectNoOrphanCard(page, ".home-cats");
  await expectNoOrphanCard(page, ".best-grid");
  await expectMoneyOnOneLine(page);
  await expectNoHorizontalScroll(page);
});

test("tiếng Anh dưới /en; core chưa có menu tiếng Anh thì dùng menu mẫu", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Kitchen tools that last, for good food every day",
  );
  const nav = page.getByRole("navigation", { name: "Categories" });
  await expect(nav.getByRole("link", { name: "Kitchen", exact: true })).toHaveAttribute(
    "href",
    "/en/danh-muc/bep-en",
  );
  await expect(page.locator(".catnav > .smark")).toHaveAttribute("title", /no `main` menu/);
  // Đổi ngôn ngữ ở chân trang về cùng đường dẫn.
  await page
    .getByRole("navigation", { name: "Language" })
    .getByRole("link", { name: "Tiếng Việt" })
    .click();
  await expect(page).toHaveURL("http://localhost:3200/");
});

test("mục bài viết: 12 bài một trang, trang sau theo con trỏ", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Góc bếp");
  await expect(page.locator(".bl-grid > *")).toHaveCount(12);
  await expectNoOrphanCard(page, ".bl-grid");
  await page.getByRole("link", { name: "Bài cũ hơn" }).click();
  await expect(page).toHaveURL(/\/blog\?cursor=/);
  await expect(page.locator(".bl-grid > *")).toHaveCount(2);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("link", { name: "Về bài mới nhất" }).click();
  await expect(page.locator(".bl-grid > *")).toHaveCount(12);
});

test("bài viết: thân bài từ core, mục lục, bản dịch, danh mục, tác giả", async ({ page }) => {
  await page.goto("/blog/chao-gang-chao-inox");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Chảo gang, chảo inox hay chống dính",
  );
  const article = page.locator("article.ar-body");
  await expect(article.getByRole("heading", { name: "Chảo gang: giữ nhiệt" })).toHaveAttribute(
    "id",
    "chao-gang-giu-nhiet",
  );
  await expect(article.getByRole("table")).toContainText("Rất tốt");
  await expect(article.getByRole("link", { name: "cách vệ sinh thớt" })).toHaveAttribute(
    "href",
    "/blog/ve-sinh-thot-go",
  );
  await expect(page.locator(".ar-tocside")).toContainText("Chảo inox 3 lớp");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    "http://localhost:3200/en/blog/cast-iron-or-stainless",
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  // Khối sản phẩm là mẫu, có dấu "mẫu".
  await expect(page.locator(".ar-products .smark")).toBeVisible();
  // Bản dịch.
  await page
    .getByRole("navigation", { name: "Ngôn ngữ bài viết" })
    .getByRole("link", { name: "EN" })
    .click();
  await expect(page).toHaveURL(/\/en\/blog\/cast-iron-or-stainless$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Cast iron, stainless or non-stick",
  );
  // Danh mục và tác giả.
  await page.goto("/blog/category/chon-mua");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chọn mua");
  await expect(page.locator(".bl-grid > *")).toHaveCount(1);
  await page.goto("/blog/author/thu-ha");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thu Hà");
  await expect(page.locator(".bl-grid > *")).toHaveCount(1);
});

test("bình luận: đọc, viết (hiện ngay), có link thì chờ duyệt", async ({ page }) => {
  await page.goto("/blog/chao-gang-chao-inox");
  const comments = page.locator("#comments");
  await expect(comments.getByRole("heading", { name: "Bình luận (1)" })).toBeVisible();
  await expect(comments).toContainText("Chảo gang nhà mình dùng 3 năm rồi.");
  await expect(comments.locator(".cm-badge")).toHaveText("Đã mua");
  const form = comments.locator("form.cm-form").first();
  await form.getByLabel("Viết bình luận").fill("Chảo gang rất hợp bếp từ.");
  await form.getByLabel("Tên hiển thị").fill("Bảo");
  await form.getByRole("button", { name: "Gửi bình luận" }).click();
  await expect(comments.getByRole("status")).toHaveText("Đã đăng bình luận của bạn.");
  await expect(comments.locator(".cm-thread")).toHaveCount(2);
  await expect(comments).toContainText("Chảo gang rất hợp bếp từ.");
  // Trả lời có link: core giữ lại chờ duyệt.
  await comments.getByRole("button", { name: "Trả lời Lan Chi" }).click();
  const reply = comments.locator(".cm-reply-form form");
  await reply.getByLabel("Viết bình luận").fill("Xem https://example.com nhé");
  await reply.getByLabel("Tên hiển thị").fill("Bảo");
  await reply.getByRole("button", { name: "Gửi bình luận" }).click();
  await expect(comments.locator(".cm-reply-form")).toContainText("đang chờ duyệt");
});

test("địa chỉ do core quyết: chuyển hướng, trang tĩnh, 404", async ({ page }) => {
  await page.goto("/blog/bai-cu");
  await expect(page).toHaveURL(/\/blog\/chao-gang-chao-inox$/);
  await page.goto("/ve-chung-toi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Về chúng tôi");
  const missing = await page.goto("/khong-co-trang-nay");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
});

test("tìm kiếm: bài viết của core và sản phẩm mẫu, gõ không dấu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Tìm sản phẩm, bài viết, cửa hàng" }).fill("chao gang");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=chao\+gang/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kết quả cho “chao gang”");
  await expect(page.locator(".sr-products .pcard").first()).toContainText("Chảo gang");
  await expect(page.locator(".sr-hits")).toContainText("Chảo gang, chảo inox hay chống dính");
});

test("tìm kiếm khi core tắt tìm theo nghĩa cho khách: tìm theo chữ trong bài viết", async ({
  page,
  request,
}) => {
  await request.post(`${CORE}/__storefront/search`, { data: { enabled: false } });
  await page.goto("/search?q=thot");
  await expect(page.locator(".sr-hits")).toContainText("Vệ sinh thớt gỗ đúng cách");
});

test("giỏ hàng mẫu và cửa hàng của bạn (cookie)", async ({ page }) => {
  await page.goto("/");
  const cart = page.locator(".hdr-cart");
  await expect(cart).toHaveAccessibleName("Giỏ hàng");
  await page.locator(".pcard", { hasText: "Bộ dao bếp 3 món" }).hover();
  await page.getByRole("button", { name: "Thêm Bộ dao bếp 3 món vào giỏ" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã thêm Bộ dao bếp 3 món vào giỏ");
  await expect(cart).toHaveAccessibleName("Giỏ hàng, 1 món");
  // Đổi cửa hàng: tình trạng hàng theo cửa hàng mới.
  await page.getByLabel("Cửa hàng của bạn").selectOption("cg");
  await expect(page.locator(".pcard", { hasText: "Bộ dao bếp 3 món" })).toContainText(
    "Còn 2 ở CN Cầu Giấy",
  );
  await page.reload();
  await expect(cart).toHaveAccessibleName("Giỏ hàng, 1 món");
});

test("bản tin: đăng ký ở chân trang, xác nhận và tuỳ chọn từ link trong thư", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel("Email nhận bản tin").fill("ban@example.com");
  await footer.getByRole("button", { name: "Đăng ký" }).click();
  await expect(footer.getByRole("status")).toContainText("Đã gửi thư xác nhận tới ban@example.com");
  await page.goto("/newsletter/confirm?token=ok-token");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã xác nhận: Bản tin hằng tuần.");
  await page.goto("/newsletter/preferences?token=ok-token");
  await expect(page.getByLabel(/Bản tin hằng tuần/)).toBeChecked();
  await page.getByRole("button", { name: "Huỷ mọi danh sách" }).click();
  await expect(page.getByRole("status")).toContainText("Đã huỷ đăng ký");
  await page.goto("/newsletter/confirm?token=sai");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Liên kết không còn dùng được",
  );
});

test("sáng / tối nhớ qua cookie", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  await page.getByRole("button", { name: "Đổi giao diện sáng / tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(15, 20, 17)");
});

test("sitemap, robots, RSS, xem trước sai token", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://localhost:3200/blog/chao-gang-chao-inox</loc>");
  expect(sitemap).toContain(
    'hreflang="en" href="http://localhost:3200/en/blog/cast-iron-or-stainless"',
  );
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: http://localhost:3200/sitemap.xml");
  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  expect(await feed.text()).toContain("<title>Chảo gang, chảo inox hay chống dính</title>");
  await page.goto("/preview?token=sai");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Liên kết xem trước không còn dùng được",
  );
});

for (const width of [360, 390, 430, 768, 820, 1024, 1280, 1440]) {
  test(`bố cục ở ${width}px: không cuộn ngang, tiền không bẻ dòng`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/en",
      "/blog",
      "/blog/chao-gang-chao-inox",
      "/search?q=th%E1%BB%9Bt",
    ]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      await expectMoneyOnOneLine(page);
    }
    await page.goto("/");
    await expectNoOrphanCard(page, ".home-cats");
    await expectNoOrphanCard(page, ".best-grid");
  });
}
