import { expect, type Page, test } from "@playwright/test";

// Màn Nội dung (Bài viết và trình soạn) với core giả (`mock-core.ts`, khối "Nội dung"). Core giả
// có sẵn hai bài: "Vệ sinh thớt gỗ đúng cách" (đã đăng) và "Bảo quản dao bếp" (bản nháp, chờ
// duyệt); một tác giả "Minh Anh", một danh mục "Chọn mua"; AI tắt.

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const rows = (page: Page) => page.locator("tbody tr");

async function openEntry(page: Page, title: string) {
  await signIn(page, "/content");
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // Trình soạn dựng ở trình duyệt sau khi tải.
  await expect(page.locator(".ce-prose[contenteditable=true]")).toBeVisible();
}

test("thanh bên có Nội dung; danh sách lọc theo trạng thái và chữ, không dấu vẫn tìm ra", async ({
  page,
}) => {
  await signIn(page, "/");
  await page
    .getByRole("navigation", { name: "Areas" })
    .getByRole("link", { name: "Content" })
    .click();
  await expect(page).toHaveURL(/\/content$/);
  await expect(page.getByRole("heading", { level: 1, name: "Posts" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole("link", { name: "Published" }).click();
  await expect(page).toHaveURL(/\/content\?status=published$/);
  await expect(page.getByRole("link", { name: "Published" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Vệ sinh thớt gỗ đúng cách");

  await page.getByRole("link", { name: "All", exact: true }).click();
  await page.getByRole("searchbox").fill("bao quan");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=bao\+quan/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Bảo quản dao bếp");
  await expect(rows(page).first()).toContainText("In review");

  await page.getByRole("searchbox").fill("không có bài này");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No post or page matches these filters.")).toBeVisible();
});

test("trên điện thoại bảng thành thẻ có nhãn cột, nút chính đứng đầu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/content");
  const card = rows(page).first();
  await expect(card.locator('td[data-label="Status"]')).toBeVisible();
  await expect(page.locator("thead")).toBeHidden();
  const newPost = await page.getByRole("link", { name: "New post" }).boundingBox();
  const newPage = await page.getByRole("link", { name: "New page" }).boundingBox();
  expect(newPost && newPage && newPost.y < newPage.y).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("tạo bài, sửa, đăng, rồi mở link xem trước không cần đăng nhập", async ({
  page,
  browser,
}) => {
  await signIn(page, "/content");
  await page.getByRole("link", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/content\/new$/);

  // Thiếu tiêu đề: báo dưới ô, không gửi.
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a title.")).toBeVisible();

  await page.getByLabel("Title").fill("Chọn chảo gang cho bếp từ");
  await page.getByLabel("Summary").fill("Ba điều cần xem.");
  const prose = page.locator(".ce-prose[contenteditable=true]");
  await prose.click();
  await page.keyboard.type("Chảo gang giữ nhiệt tốt.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Chọn chảo gang cho bếp từ" }),
  ).toBeVisible();
  await expect(page.locator(".ce-prose")).toContainText("Chảo gang giữ nhiệt tốt.");

  await page.getByLabel("Title").fill("Chọn chảo gang cho bếp từ, bản sửa");
  await expect(page.getByTestId("save-state")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(toast(page)).toContainText("Draft saved");
  await expect(page.getByTestId("save-state")).toContainText("Saved");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Publish now" }).click();
  await expect(toast(page)).toContainText("Published");
  await expect(page.locator(".ce-meta")).toContainText("Published");

  await page.getByRole("button", { name: "Preview" }).click();
  await dialog(page).getByRole("button", { name: "Create preview link" }).click();
  const link = await dialog(page).getByLabel("Preview link").inputValue();
  expect(link).toMatch(/\/preview\?token=/);

  // Người không có tài khoản mở link: không bị đưa về trang đăng nhập.
  const stranger = await browser.newContext();
  const reader = await stranger.newPage();
  await reader.goto(link);
  await expect(reader).toHaveURL(/\/preview\?token=/);
  await expect(
    reader.getByRole("heading", { level: 1, name: "Chọn chảo gang cho bếp từ, bản sửa" }),
  ).toBeVisible();
  await expect(reader.getByText("Chảo gang giữ nhiệt tốt.")).toBeVisible();
  await reader.goto("/preview?token=sai");
  await expect(reader.getByText(/invalid or has expired/)).toBeVisible();
  await stranger.close();
});

test("người khác sửa trước: core trả 412, giao diện báo và không ghi đè", async ({
  page,
  request,
}) => {
  await openEntry(page, "Bảo quản dao bếp");
  const id = page.url().split("/").pop();
  await page.getByLabel("Title").fill("Bảo quản dao bếp, bản của tôi");
  await request.post(`${CORE}/__content/bump`, { data: { id } });
  await page.getByRole("button", { name: "Save draft" }).click();
  const alert = page.locator(".ce-alert");
  await expect(alert).toHaveAttribute("data-code", "precondition_failed");
  await expect(alert).toContainText("Someone changed this entry");
  await expect(page.getByTestId("save-state")).toHaveText("Unsaved changes");
});

test("link không an toàn bị chặn ngay ở hộp thoại; lỗi tiêu đề của core nằm dưới ô", async ({
  page,
}) => {
  await openEntry(page, "Bảo quản dao bếp");
  await page.locator(".ce-prose[contenteditable=true]").click();
  await page.keyboard.type("Đọc thêm");
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await dialog(page).getByLabel("Address").fill("javascript:alert(1)");
  await dialog(page).getByRole("button", { name: "Insert" }).click();
  await expect(dialog(page).getByLabel("Address")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Address").fill("https://example.com/dao");
  await dialog(page).getByRole("button", { name: "Insert" }).click();
  await expect(page.locator(".ce-prose a[href='https://example.com/dao']")).toHaveText(
    "Đọc thêm",
  );

  await page.getByLabel("Title").fill(" ");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("must be 1 to 300 characters")).toBeVisible();
});

test("gửi duyệt, danh mục, gỡ đăng có xác nhận, khôi phục phiên bản; nút AI tắt kèm lý do", async ({
  page,
}) => {
  await openEntry(page, "Vệ sinh thớt gỗ đúng cách");

  await page.getByRole("button", { name: "Request review" }).click();
  await expect(toast(page)).toContainText("Review requested");
  await expect(page.locator(".ce-meta")).toContainText("In review");
  await page.getByRole("button", { name: "Withdraw review" }).click();
  await expect(toast(page)).toContainText("Review request withdrawn");

  await page.getByRole("checkbox", { name: "Chọn mua" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Categories and tags saved");

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(dialog(page)).toContainText("its address answers 404");
  await dialog(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(toast(page)).toContainText("Taken down");
  await expect(page.locator(".ce-meta")).toContainText("Draft");

  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Created");
  await page.getByRole("tabpanel").getByRole("button", { name: "Restore" }).last().click();
  await dialog(page).getByRole("button", { name: "Restore" }).click();
  await expect(toast(page)).toContainText("Revision restored into the draft");

  await page.getByRole("tab", { name: /SEO/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No search title: the title is used.");
  await expect(page.getByRole("button", { name: "Suggest title and description" })).toBeDisabled();
  await expect(page.getByRole("tabpanel")).toContainText("AI is off on this server");

  await page.getByRole("tab", { name: "Languages" }).click();
  await expect(page.getByRole("button", { name: "Translate with AI" })).toBeDisabled();
  await page.getByRole("button", { name: "Create blank translation" }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
  await expect(page.locator(".ce-strip")).toContainText("English");
});
