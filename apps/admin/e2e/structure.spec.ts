import { expect, type Page, test } from "@playwright/test";

// Màn "Trang và cấu trúc" với core giả (`mock-structure.ts`): cây trang và chuyển trang cha, danh
// mục và thẻ (gắn vào bài trong trình soạn), tác giả, chuyển hướng, menu cũ chỉ đọc, so hai phiên
// bản (cả "Xem khác biệt" trong trình soạn).

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");

test("cây trang: chuyển trang cha, đường dẫn ghép theo cây; không chọn được con cháu", async ({
  page,
  request,
}) => {
  await request.post(`${CORE}/__content/pages`);
  await signIn(page, "/content/structure");
  await expect(page.getByRole("heading", { level: 1, name: "Pages and structure" })).toBeVisible();
  const policy = page.locator("tr", { hasText: "Chính sách đổi trả" });
  await expect(policy).toContainText("/chinh-sach-doi-tra");
  await expect(policy).toContainText("top level");

  await policy.getByRole("button", { name: "Move" }).click();
  await dialog(page)
    .getByLabel("Parent page")
    .selectOption({ label: "/ve-chung-toi · Về chúng tôi" });
  await dialog(page).getByRole("button", { name: "Move" }).click();
  await expect(toast(page)).toContainText("Page moved");
  await expect(policy).toContainText("/ve-chung-toi/chinh-sach-doi-tra");
  await expect(policy).toContainText("under Về chúng tôi");
  const about = page.locator("tr", { hasText: "Về chúng tôi" }).first();
  await expect(about).toContainText("1 subpage");

  // Trang cha không được chọn chính trang con của nó.
  await about.getByRole("button", { name: "Move" }).click();
  const options = await dialog(page).getByLabel("Parent page").locator("option").allTextContents();
  expect(options.some((o) => o.includes("Chính sách đổi trả"))).toBe(false);
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Mở trang thì dùng trình soạn có sẵn.
  await page.getByRole("link", { name: "Chính sách đổi trả" }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
});

test("danh mục: tạo, sửa theo ngôn ngữ, gắn vào bài; thẻ; tác giả", async ({ page }) => {
  await signIn(page, "/content/structure/terms");
  await page.getByRole("button", { name: "Add category" }).click();
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(dialog(page).getByText("Enter a name.")).toBeVisible();
  await dialog(page).getByLabel("Language").selectOption("vi");
  await dialog(page).getByLabel("Name").fill("Mẹo dùng");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Added");
  const row = page.locator("tr", { hasText: "Mẹo dùng" });
  await expect(row).toContainText("meo-dung");

  // Sửa: thêm tên tiếng Anh (cùng danh mục, ngôn ngữ khác).
  await row.getByRole("button", { name: "Edit" }).click();
  await dialog(page).getByLabel("Language").selectOption("en");
  await dialog(page).getByLabel("Name").fill("Kitchen tips");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toContainText("Saved");
  // Giao diện tiếng Anh: tên tiếng Anh hiện ở bảng.
  const edited = page.locator("tr", { hasText: "Kitchen tips" });
  await expect(edited).toContainText("EN · VI");

  // Slug trùng: core báo dưới ô slug.
  await page.getByRole("button", { name: "Add tag" }).click();
  await dialog(page).getByLabel("Name").fill("Chọn mua");
  await dialog(page).getByLabel("Slug").fill("chon-mua");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Added");

  // Gắn danh mục vào bài trong trình soạn.
  await page.goto("/content");
  await page.getByRole("link", { name: "Vệ sinh thớt gỗ đúng cách" }).click();
  await expect(page.locator(".ce-prose[contenteditable=true]")).toBeVisible();
  await page.getByLabel("Mẹo dùng").check();
  await page
    .locator("section[aria-labelledby=ce-terms-h]")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(toast(page)).toContainText("Categories and tags saved");
  await page.reload();
  await expect(page.getByLabel("Mẹo dùng")).toBeChecked();

  // Số bài của danh mục (`entry_count` của core); bấm số để xem các bài đó.
  await page.goto("/content/structure/terms");
  const tips = page.locator("tr", { hasText: "Kitchen tips" });
  await expect(tips.locator('td[data-label="Posts"]')).toHaveText("1");
  await tips.locator('td[data-label="Posts"]').getByRole("link").click();
  await expect(page).toHaveURL(/\/content\?term=[0-9a-f-]{36}$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Vệ sinh thớt gỗ đúng cách");

  // Tìm theo tên ở mọi ngôn ngữ, không dấu (`q` của core).
  await page.goto("/content/structure/terms");
  await page.getByLabel("Find a category or tag").fill("meo dung");
  await expect(page).toHaveURL(/q=meo\+dung/);
  await expect(page.locator("tr", { hasText: "Kitchen tips" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Chọn mua" })).toHaveCount(0);

  // Tác giả.
  await page.goto("/content/structure/authors");
  await expect(page.getByText("Minh Anh", { exact: true })).toBeVisible();
  await expect(page.locator(".st-tile", { hasText: "Minh Anh" })).toContainText("1 post");
  await page.getByRole("button", { name: "Add author" }).click();
  await dialog(page).getByLabel("Display name").fill("Thu Hà");
  await dialog(page).getByLabel("Short bio").fill("Biên tập Góc bếp");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Author added");
  await expect(page.getByText("Biên tập Góc bếp")).toBeVisible();
  await page.getByLabel("Find an author").fill("thu ha");
  await expect(page.locator(".st-tile")).toHaveCount(1);
  await expect(page.locator(".st-tile")).toContainText("Thu Hà");
});

test("chuyển hướng: thêm, lỗi của core dưới ô, lọc theo nguồn, xoá; menu cũ chỉ đọc", async ({
  page,
}) => {
  await signIn(page, "/content/structure/redirects");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Add redirect" }).click();
  await dialog(page).getByLabel("From").fill("/gioi-thieu");
  await dialog(page).getByLabel("Address", { exact: true }).fill("//evil.example.com");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(dialog(page).locator(".ferr")).toContainText("https://");
  await dialog(page).getByLabel("Address", { exact: true }).fill("/ve-chung-toi");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Redirect added");
  await expect(page.locator("tbody tr", { hasText: "/ve-chung-toi" })).toContainText("Manual");

  await page.getByRole("link", { name: "Automatic" }).click();
  await expect(page).toHaveURL(/source=auto/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Manual" }).click();
  const manual = page.locator("tbody tr");
  await expect(manual).toHaveCount(1);
  await manual.getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("stops redirecting");
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Redirect deleted");
  await expect(page.getByText("No redirects match.")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Parts of the content structure" })
    .getByRole("link", { name: "Menus" })
    .click();
  await expect(page).toHaveURL(/\/content\/structure\/menus$/);
  await expect(page.getByText("Read only")).toBeVisible();
  await expect(page.getByText("mailto:hotro@example.com")).toBeVisible();
});

test("lịch sử phiên bản: so hai phiên bản; 'Xem khác biệt' trong trình soạn", async ({ page }) => {
  await signIn(page, "/content");
  await page.getByRole("link", { name: "Vệ sinh thớt gỗ đúng cách" }).click();
  await expect(page.locator(".ce-prose[contenteditable=true]")).toBeVisible();
  await page.getByLabel("Title").fill("Vệ sinh thớt gỗ, bản mới");
  await page.locator(".ce-prose").click();
  await page.keyboard.type("Rửa bằng nước ấm.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(toast(page)).toContainText("Draft saved");
  // Phiên bản được giữ khi đăng.
  await page
    .getByRole("button", { name: /^Publish/ })
    .first()
    .click();
  await dialog(page)
    .getByRole("button", { name: /Publish/ })
    .last()
    .click();
  await expect(toast(page)).toContainText("Published");

  await page.getByRole("tab", { name: "History" }).click();
  // Phiên bản đầu (lúc tạo) so với phiên bản ngay sau nó (lúc đăng).
  await expect(page.getByRole("button", { name: "Show changes" })).toHaveCount(2);
  await page.getByRole("button", { name: "Show changes" }).nth(1).click();
  await expect(dialog(page).locator("ins")).toContainText("Vệ sinh thớt gỗ, bản mới");
  await expect(dialog(page).locator("li.add")).toContainText("Rửa bằng nước ấm.");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Compare any two versions" }).click();
  await expect(page).toHaveURL(/\/content\/structure\/history\?entry=/);
  await expect(page.getByRole("heading", { name: "Version 1 → version 2" })).toBeVisible();
  await expect(page.locator(".st-diff del")).toContainText("Vệ sinh thớt gỗ đúng cách");
  await expect(page.locator(".st-diff ins")).toContainText("Vệ sinh thớt gỗ, bản mới");
});
