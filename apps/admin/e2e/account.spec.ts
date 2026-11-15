import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

// Màn "Tài khoản của tôi" với core giả (`mock-core.ts`): mọi thao tác đi qua Server Action hay
// route handler ở máy chủ, nên trình duyệt không bao giờ thấy token.

const CORE = "http://127.0.0.1:4010";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path = "/account") {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");

test("menu tài khoản mở màn; hồ sơ: gửi lại thư xác minh, đổi email gom lỗi dưới ô", async ({
  page,
}) => {
  await signIn(page, "/");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("link", { name: "My account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("account-email")).toHaveText("admin@example.com");
  await expect(page.getByText("Not verified")).toBeVisible();
  // Màn của riêng người dùng: không lên thanh bên.
  await expect(
    page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: "My account" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Send the mail again" }).click();
  await expect(toast(page)).toHaveText("A verification mail is on its way to admin@example.com.");

  await page.getByRole("button", { name: "Change email" }).click();
  const box = dialog(page);
  await box.getByRole("button", { name: "Send verification mail" }).click();
  await expect(box.getByRole("alert")).toHaveText("2 fields need fixing.");
  await expect(box.getByLabel("New email")).toHaveAttribute("aria-invalid", "true");
  await expect(box.getByLabel("New email")).toBeFocused();
  await expect(box.getByText("Enter your current password.")).toBeVisible();

  await box.getByLabel("New email").fill("viewer@example.com");
  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Send verification mail" }).click();
  await expect(box.getByText("Another account has this email.")).toBeVisible();
  await expect(box.getByRole("alert")).toHaveAttribute("data-code", "auth.email_taken");
  await expect(box.getByLabel("New email")).toHaveValue("viewer@example.com");

  await box.getByLabel("New email").fill("ada@example.org");
  await box.getByLabel("Current password").fill("wrong");
  await box.getByRole("button", { name: "Send verification mail" }).click();
  await expect(box.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");
  await expect(box.getByText("The current password is incorrect.")).toBeVisible();

  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Send verification mail" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText("A verification mail is on its way to ada@example.org.");

  // Email đang chờ xác minh (`pending_email` của core), huỷ được; email hiện tại giữ nguyên.
  const pending = page.getByTestId("pending-email");
  await expect(pending).toContainText("ada@example.org");
  await expect(pending).toContainText("Waiting for confirmation");
  await pending.getByRole("button", { name: "Cancel change" }).click();
  await expect(toast(page)).toHaveText(
    "Cancelled the change to ada@example.org. Your email stays as it is.",
  );
  await expect(page.getByTestId("pending-email")).toHaveCount(0);
  await expect(page.getByTestId("account-email")).toHaveText("admin@example.com");
});

test("đổi mật khẩu: lỗi của core dưới ô; xong vẫn đăng nhập bằng phiên mới", async ({
  page,
  context,
}) => {
  await signIn(page);
  const before = (await context.cookies()).find((c) => c.name === "ax_session")?.value;
  expect(before).toBeTruthy();

  await page.getByRole("button", { name: "Change password" }).first().click();
  const box = dialog(page);
  await box.getByLabel("Current password").fill("admin password");
  await box.getByLabel("New password").fill("short");
  await box.getByRole("button", { name: "Change password" }).click();
  await expect(box.getByText("must be between 12 and 128 characters long")).toBeVisible();
  await expect(box.getByLabel("New password")).toHaveAttribute("aria-invalid", "true");

  await box.getByLabel("Current password").fill("admin password");
  await box.getByLabel("New password").fill("a much longer password");
  await box.getByRole("button", { name: "Change password" }).click();
  await expect(toast(page)).toHaveText("Password changed. Other devices must sign in again.");

  // Core kết thúc mọi phiên và trả token của phiên mới: cookie đã đổi, trang vẫn mở được.
  const cookies = await context.cookies();
  const after = cookies.find((c) => c.name === "ax_session");
  expect(after?.value).not.toBe(before);
  expect(after?.httpOnly).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
});

test("xác thực hai bước: QR và khoá gõ tay, mã khôi phục chỉ hiện một lần, tạo lại, tắt", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, "/account/security");
  const row = page.getByTestId("totp");
  await expect(row).toContainText("Off");

  await row.getByRole("button", { name: "Turn on" }).click();
  const box = dialog(page);
  await box.getByLabel("Current password").fill("wrong");
  await box.getByRole("button", { name: "Continue" }).click();
  await expect(box.getByRole("alert")).toHaveAttribute("data-code", "auth.wrong_password");
  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Continue" }).click();

  await expect(box.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(box.getByTestId("totp-secret")).toHaveText("JBSW Y3DP EHPK 3PXP");
  await box.getByLabel("6-digit code from the app").fill("000000");
  await box.getByRole("button", { name: "Turn on" }).click();
  await expect(box.getByText("is not a current code from your app")).toBeVisible();
  await box.getByLabel("6-digit code from the app").fill("123456");
  await box.getByRole("button", { name: "Turn on" }).click();

  const codes = box.getByRole("list", { name: "Recovery codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  const first = (await codes.first().textContent()) ?? "";
  await box.getByRole("button", { name: "Copy" }).click();
  await expect(box.getByText("Copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(first);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    box.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("autoxide-recovery-codes.txt");
  expect(await readFile(await download.path(), "utf8")).toContain(first);
  // Trạng thái trên trang đã đổi mà mã vẫn còn trên hộp thoại tới khi người dùng đóng.
  await expect(row).toContainText("10 recovery codes left");
  await box.getByRole("button", { name: "I stored them" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await row.getByRole("button", { name: "New recovery codes" }).click();
  await dialog(page).getByLabel("6-digit code from the app").fill("123456");
  await dialog(page).getByRole("button", { name: "Make codes" }).click();
  await expect(dialog(page).getByRole("listitem")).toHaveCount(10);
  await expect(dialog(page).getByText(first)).toHaveCount(0);
  const recovery = (await dialog(page).getByRole("listitem").first().textContent()) ?? "";
  await dialog(page).getByRole("button", { name: "I stored them" }).click();

  await row.getByRole("button", { name: "Turn off" }).click();
  await expect(dialog(page)).toContainText("remaining recovery codes are deleted");
  await dialog(page).getByLabel("6-digit code or a recovery code").fill(recovery);
  await dialog(page).getByRole("button", { name: "Turn off" }).click();
  await expect(toast(page)).toHaveText("Two-step sign-in is off.");
  await expect(row).toContainText("Off");
});

test("passkey: thêm qua WebAuthn của trình duyệt, hiện trong danh sách, gỡ", async ({
  page,
  context,
}) => {
  // Authenticator ảo của Chromium thay cho vân tay / khuôn mặt.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await signIn(page, "/account/security");
  await expect(page.getByText("No passkey yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add passkey" }).click();
  const box = dialog(page);
  await box.getByRole("button", { name: "Continue" }).click();
  await expect(box.getByRole("alert")).toHaveText("2 fields need fixing.");
  await box.getByLabel("Name").fill("Work laptop");
  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Continue" }).click();
  await expect(toast(page)).toHaveText("Passkey added.");
  await expect(dialog(page)).toHaveCount(0);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Work laptop");
  await expect(rows.first()).toContainText("Never");

  // Cùng một authenticator lần hai: trình duyệt từ chối vì đã có (excludeCredentials).
  await page.getByRole("button", { name: "Add passkey" }).click();
  await dialog(page).getByLabel("Name").fill("Again");
  await dialog(page).getByLabel("Current password").fill("admin password");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveAttribute(
    "data-code",
    /account\.webauthn_(exists|cancelled)/,
  );
  await page.keyboard.press("Escape");

  await rows.first().getByRole("button", { name: "Remove" }).click();
  await expect(dialog(page)).toContainText('Remove the passkey "Work laptop"?');
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(toast(page)).toHaveText("Passkey removed.");
  await expect(page.getByText("No passkey yet.")).toBeVisible();
});

test("tài khoản chưa có mật khẩu: xin thư đặt mật khẩu đầu tiên; xoá tài khoản chỉ sang đặt mật khẩu", async ({
  page,
  request,
}) => {
  await signIn(page, "/account/security");
  const row = page.getByTestId("password");
  await expect(row.getByRole("button", { name: "Change password" })).toBeVisible();
  await request.post(`${CORE}/__no-password`, { data: { email: "admin@example.com" } });
  await page.reload();
  await expect(row).toContainText("Your account has no password");
  await expect(row.getByRole("button", { name: "Change password" })).toHaveCount(0);
  // Máy chủ chưa gửi thư thật (`mail.sends` của cấu hình cho giao diện): nói trước.
  await expect(page.getByText("This server does not send mail yet")).toBeVisible();
  await row.getByRole("button", { name: "Send me the link" }).click();
  await expect(toast(page)).toContainText("A mail with a link to choose your password");
  expect((await (await request.get(`${CORE}/__resets`)).json()).emails).toEqual([
    "admin@example.com",
  ]);

  await page.goto("/account/data");
  await expect(page.getByRole("button", { name: "Delete account" })).toHaveCount(0);
  await page.getByRole("link", { name: "Set a password" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
});

test("phiên: đánh dấu phiên này, đăng xuất một thiết bị, đăng xuất mọi thiết bị khác", async ({
  page,
  request,
}) => {
  await signIn(page, "/account/sessions");
  for (const agent of [FIREFOX, IPHONE]) {
    await request.post(`${CORE}/__sessions`, {
      data: {
        email: "admin@example.com",
        user_agent: agent,
        ...(agent === IPHONE ? { method: "passkey", country: "VN" } : {}),
      },
    });
  }
  await page.reload();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "Mobile Safari on iOS" })).toHaveCount(1);
  // Cách đăng nhập và quốc gia gần đúng của mỗi phiên (core không lưu IP).
  await expect(rows.filter({ hasText: "Mobile Safari on iOS" })).toContainText("Passkey");
  await expect(rows.filter({ hasText: "Mobile Safari on iOS" })).toContainText("Vietnam");
  await expect(page.locator("tbody tr[data-current]")).toContainText("Password");
  // Phiên của trình duyệt này: core lưu User-Agent mà máy chủ chuyển tiếp lúc đăng nhập.
  const mine = page.locator("tbody tr[data-current]");
  await expect(mine).toContainText("This session");
  await expect(mine.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out Firefox on Windows" }).click();
  await expect(toast(page)).toHaveText("Signed out. That device must sign in again.");
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "Sign out every other device" }).click();
  await expect(dialog(page)).toContainText("The other device must sign in again.");
  await dialog(page).getByRole("button", { name: "Sign out others" }).click();
  await expect(toast(page)).toHaveText("Signed out 1 device.");
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign out every other device" })).toBeHidden();
});

test("dữ liệu: tải về qua máy chủ; xoá tài khoản cần gõ đúng email, xong về đăng nhập", async ({
  page,
  context,
}) => {
  await signIn(page, "/account/data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^autoxide-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.auth.profile.email).toBe("admin@example.com");

  await page.getByRole("button", { name: "Delete account" }).click();
  const box = dialog(page);
  await expect(box).toContainText("cannot be undone");
  await box.getByLabel("Type admin@example.com to confirm").fill("someone@example.com");
  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Delete for good" }).click();
  await expect(
    box.getByText("This is not your email. Type admin@example.com exactly."),
  ).toBeVisible();

  await box.getByLabel("Type admin@example.com to confirm").fill("Admin@example.com");
  await box.getByLabel("Current password").fill("wrong");
  await box.getByRole("button", { name: "Delete for good" }).click();
  await expect(box.getByRole("alert")).toHaveAttribute("data-code", "auth.wrong_password");

  await box.getByLabel("Current password").fill("admin password");
  await box.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByText("Your account was deleted and you were signed out.")).toBeVisible();
  const left = (await context.cookies()).map((cookie) => cookie.name);
  for (const name of ["ax_access", "ax_refresh", "ax_session"]) {
    expect(left).not.toContain(name);
  }
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toHaveAttribute(
    "data-code",
    "auth.invalid_credentials",
  );
});

test("điện thoại: các tab không tràn ngang, bảng thành thẻ, hộp thoại là tấm từ đáy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const path of ["/account", "/account/security", "/account/sessions", "/account/data"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Delete account" }).click();
  const box = await dialog(page).boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
  expect(Math.round(box?.width ?? 0)).toBe(390);
});
