import { expect, type Page, test } from "@playwright/test";

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("chưa đăng nhập thì về trang đăng nhập, xong thì quay lại trang đã mở", async ({ page }) => {
  // Đường dẫn cũ /modules/… vẫn mở được: chuyển sang Cài đặt › Module.
  await page.goto("/modules/notes");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fmodules%2Fnotes$/);

  await signIn(page, "admin@example.com", "admin password");

  await expect(page).toHaveURL(/\/settings\/modules\/notes$/);
  await expect(page.getByRole("heading", { name: "notes" })).toBeVisible();
});

test("sai mật khẩu báo lỗi của core và giữ lại email", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "admin@example.com", "wrong");

  const alert = page.locator("p[role=alert]");
  await expect(alert).toHaveText("The email or password is incorrect.");
  await expect(alert).toHaveAttribute("data-code", "auth.invalid_credentials");
  await expect(page.getByLabel("Email")).toHaveValue("admin@example.com");
});

test("danh sách module, chi tiết, module không có, đăng xuất", async ({ page, context }) => {
  await page.goto("/login");
  await signIn(page, "admin@example.com", "admin password");
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByTestId("me")).toHaveText("admin@example.com");
  await page
    .getByRole("navigation", { name: "Areas" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/settings\/modules$/);

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("kernel");
  await expect(rows.nth(0)).toContainText("Built-in");

  // Trình duyệt không đọc được token: cookie là httpOnly.
  const cookies = await context.cookies();
  for (const name of ["ax_access", "ax_refresh"]) {
    expect(cookies.find((cookie) => cookie.name === name)?.httpOnly).toBe(true);
  }

  await page.getByRole("link", { name: "notes" }).click();
  await expect(page).toHaveURL(/\/modules\/notes$/);
  await expect(page.getByText("Not applied")).toBeVisible();
  await expect(page.getByText("notes.delete_note")).toBeVisible();
  await expect(page.getByText("Every 1 day")).toBeVisible();

  await page.goto("/modules/shop");
  await expect(page.getByText("This page does not exist.")).toBeVisible();

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const left = (await context.cookies()).map((cookie) => cookie.name);
  expect(left).not.toContain("ax_access");
  expect(left).not.toContain("ax_refresh");
  await page.goto("/modules");
  await expect(page).toHaveURL(/\/login/);
});

test("access token hết hạn thì tự làm mới, mỗi refresh token chỉ dùng một lần", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await signIn(page, "admin@example.com", "admin password");
  await expect(page).toHaveURL(/:\d+\/$/);
  await page.goto("/settings/modules");

  // Cookie access hết sau 1 giây.
  await page.waitForTimeout(1_500);
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.waitForTimeout(1_500);
  await page.getByRole("link", { name: "notes" }).click();
  await expect(page.getByRole("heading", { name: "notes" })).toBeVisible();

  // Core giả từ chối refresh token đã dùng: tới đây mà vẫn đăng nhập nghĩa là không có lần
  // làm mới nào gửi lại token cũ.
  const stats = await (await request.get(`${CORE}/__stats`)).json();
  expect(stats.refreshes).toBeGreaterThanOrEqual(2);
});

test("đăng nhập hai bước", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "mfa@example.com", "mfa password");

  await expect(page.getByText("Two-step sign-in")).toBeVisible();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("p[role=alert]")).toHaveAttribute("data-code", "auth.invalid_mfa_code");

  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
});

test("thiếu permission thì báo rõ permission cần có", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "viewer@example.com", "viewer password");
  await expect(page).toHaveURL(/:\d+\/$/);

  // Không có quyền xem sổ module: menu không bày ra màn Module, mở thẳng thì báo rõ.
  await expect(
    page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: "Settings" }),
  ).toHaveCount(0);
  await page.goto("/settings/modules");
  await expect(page.getByText("Not allowed")).toBeVisible();
  await expect(page.getByText(/kernel\.modules\.read/)).toBeVisible();
});

test("đổi sang tiếng Việt, kể cả thông báo lỗi của core", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Tiếng Việt" }).click();
  await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();

  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Mật khẩu").fill("sai");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("p[role=alert]")).toHaveText("Email hoặc mật khẩu không đúng.");
});

test("khung: Ctrl K tìm không dấu rồi mở màn; điện thoại có thanh đáy và bảng Phân hệ", async ({
  page,
}) => {
  await page.goto("/login");
  await signIn(page, "admin@example.com", "admin password");
  await expect(page).toHaveURL(/:\d+\/$/);

  await page.keyboard.press("Control+k");
  const search = page.getByRole("searchbox", { name: "Find a page or an area…" });
  await expect(search).toBeFocused();
  await search.fill("modu");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/modules$/);
  await expect(page.getByRole("link", { name: "Settings" }).first()).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Areas" }).click();
  const sheet = page.getByRole("dialog", { name: "Areas" });
  await expect(sheet.getByRole("link", { name: "Overview" })).toBeVisible();
  await sheet.getByRole("link", { name: "Overview" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  // Bảng thành thẻ: không tràn ngang trên điện thoại
  await page.goto("/settings/modules");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
