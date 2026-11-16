import { expect, test } from "@playwright/test";

// W-040: form gửi bằng `onSubmit` đặt thẳng trên trang khoá nút gửi tới khi JavaScript của trang chạy.
// Bấm sớm hơn thì trình duyệt gửi form kiểu thô: tải lại trang, giá trị đã gõ (cả email) lên thanh địa
// chỉ, không lưu gì. Kiểm bằng một trình duyệt tắt JavaScript, cùng phiên đăng nhập.

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

test("tắt JavaScript: nút gửi của form đặt thẳng trên trang bị khoá", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);

  const bare = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  const html = await bare.newPage();
  for (const [path, button] of [
    ["/org/access/roles/new", "Create role"],
    ["/settings/api-keys/new", "Create key"],
    ["/marketing/comments/data", "Look up"],
    ["/content/new", "Create draft"],
  ] as const) {
    await html.goto(path);
    await expect(html.getByRole("button", { name: button }), path).toBeDisabled();
  }
  await bare.close();

  // Trang đã chạy JavaScript: bấm được.
  await page.goto("/org/access/roles/new");
  await expect(page.getByRole("button", { name: "Create role" })).toBeEnabled();
});
