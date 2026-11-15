import { expect, test } from "@playwright/test";

// Trang mở từ link trong thư (xác minh email, quên / đặt lại mật khẩu): không cần đăng nhập, gọi
// endpoint công khai của core giả (`mock-access.ts`; token mẫu `verify-ok`, `reset-ok`, `report-ok`).

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

test("xác minh email: không cần đăng nhập, chỉ gửi khi bấm; token đã dùng báo theo code", async ({
  page,
}) => {
  await page.goto("/verify-email?token=verify-ok");
  await expect(page).toHaveURL(/\/verify-email\?token=verify-ok$/);
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "viewer@example.com is confirmed. If you asked to change your address, sign in with this one from now on.",
  );

  await page.goto("/verify-email?token=verify-ok");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.locator("p[role=alert]")).toHaveAttribute(
    "data-code",
    "auth.invalid_verification_token",
  );
  await expect(page.getByText("send a new verification mail from My account")).toBeVisible();

  await page.goto("/verify-email");
  await expect(page.getByText("This link is incomplete.")).toBeVisible();
});

test("quên mật khẩu: link ở trang đăng nhập, gom lỗi ô, luôn cùng một câu", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter your email address.")).toBeVisible();

  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If an account has the address nobody@example.com",
  );
  expect((await (await request.get(`${CORE}/__resets`)).json()).emails).toEqual([
    "nobody@example.com",
  ]);
});

test("đặt lại mật khẩu: token sai, hai ô khác nhau, luật của core; xong đăng nhập bằng mật khẩu mới", async ({
  page,
}) => {
  await page.goto("/reset-password?token=wrong");
  await page.getByLabel("New password", { exact: true }).fill("a brand new password");
  await page.getByLabel("New password again").fill("a brand new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("p[role=alert]")).toHaveAttribute(
    "data-code",
    "auth.invalid_reset_token",
  );
  await expect(page.getByRole("link", { name: "Ask for a new link" })).toBeVisible();

  await page.goto("/reset-password?token=reset-ok");
  await page.getByLabel("New password", { exact: true }).fill("a brand new password");
  await page.getByLabel("New password again").fill("another password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The two passwords differ.")).toBeVisible();
  await expect(page.getByLabel("New password again")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("New password again").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("must be between 12 and 128 characters long")).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("a brand new password");
  await page.getByLabel("New password again").fill("a brand new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password was changed");
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill("viewer@example.com");
  await page.getByLabel("Password").fill("a brand new password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("me")).toHaveText("viewer@example.com");
});

test("không phải tôi đổi email: trang công khai, chỉ khoá khi bấm; token đã dùng báo theo code", async ({
  page,
}) => {
  await page.goto("/not-me?token=report-ok");
  await expect(page).toHaveURL(/\/not-me\?token=report-ok$/);
  await expect(
    page.getByRole("heading", { name: "Did someone else change your email?" }),
  ).toBeVisible();
  await expect(page.getByText("Reporting locks the account")).toBeVisible();
  await page.getByRole("button", { name: "It was not me — lock my account" }).click();
  await expect(page.getByRole("status")).toContainText("can no longer get in");

  await page.goto("/not-me?token=report-ok");
  await page.getByRole("button", { name: "It was not me — lock my account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveAttribute(
    "data-code",
    "auth.invalid_email_change_report_token",
  );
  await expect(page.getByText("This link is unknown, expired or already used.")).toBeVisible();

  await page.goto("/not-me");
  await expect(page.getByText("This link is incomplete.")).toBeVisible();
});
