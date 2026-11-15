import { expect, type Page, test } from "@playwright/test";

// Trợ giúp trong giao diện (thiết kế mục 6, W-023): nút "?" mở bảng Trợ giúp theo trang, nút ⓘ mở hộp
// giải thích, thẻ giới thiệu tính năng mới tắt được. Gợi ý đã tắt và "Có gì mới" đã xem lưu ở cờ theo
// tài khoản của core (`/api/v1/me/flags`), nên trình duyệt khác cùng tài khoản cũng không thấy lại.

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

const helpButton = (page: Page) => page.getByRole("button", { name: /^Help for this page/ });
const panel = (page: Page) => page.getByRole("dialog", { name: /^Help/ });

test("bảng Trợ giúp theo trang; chấm Có gì mới mất sau khi mở", async ({ page }) => {
  await signIn(page, "/");
  // Chưa xem tin nào: nút có chấm.
  await expect(page.getByTestId("help-dot")).toBeVisible();
  const seen = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
  );
  await helpButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAccessibleName("Help · Overview");
  await expect(panel(page).getByText("Where work comes from")).toBeVisible();
  await expect(panel(page).getByRole("list", { name: "What's new" })).toBeVisible();
  await expect(page.getByTestId("help-dot")).toHaveCount(0);
  await seen;
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();

  // Trang khác, bài khác; tìm thấy cả bài của trang khác.
  await page.goto("/sales/orders");
  await expect(page.getByTestId("help-dot")).toHaveCount(0);
  await helpButton(page).click();
  await expect(panel(page)).toHaveAccessibleName("Help · Orders");
  await expect(panel(page).getByRole("link", { name: /Refunds and returns/ })).toHaveAttribute(
    "href",
    "/sales/orders/returns",
  );
  await panel(page).getByRole("searchbox", { name: "Search the guides" }).fill("inviting");
  await panel(page)
    .getByRole("link", { name: /Inviting members/ })
    .click();
  await expect(page).toHaveURL(/\/org\/access\/invitations$/);
  await expect(panel(page)).toBeHidden();

  // Phím "?" mở bảng ở mọi màn.
  await page.keyboard.press("?");
  await expect(panel(page)).toHaveAccessibleName("Help · Organization");

  // Cờ ghi ở core theo tài khoản.
  await page.reload();
  await expect(page.getByTestId("help-dot")).toHaveCount(0);
});

test("nút ⓘ mở hộp giải thích; Tìm hiểu thêm mở bảng Trợ giúp", async ({ page }) => {
  await signIn(page, "/org");
  const tip = page.getByRole("dialog", { name: "Depth of permissions" });
  await page.getByRole("button", { name: "Explain: Depth of permissions" }).click();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("The role says what you may do; the depth says where.");
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  // Tiêu đề mục giữ đúng tên của nó.
  await expect(
    page.getByRole("heading", { name: "Depth of permissions", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Explain: Depth of permissions" }).click();
  await tip.getByRole("button", { name: "Learn more" }).click();
  await expect(tip).toBeHidden();
  await expect(panel(page)).toHaveAccessibleName("Help · Organization");
});

test("thẻ giới thiệu tắt rồi không hiện lại, kể cả ở trình duyệt khác cùng tài khoản", async ({
  page,
  browser,
}) => {
  await signIn(page, "/sales/orders");
  const card = page.getByRole("note").filter({ hasText: "Save views for filters you use often." });
  await expect(card).toBeVisible();
  // Thẻ ẩn ngay; cờ ghi qua Server Action (POST có header `next-action`).
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
  );
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toBeHidden();
  await saved;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved views", exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);

  const other = await browser.newContext();
  const second = await other.newPage();
  await signIn(second, "/sales/orders");
  await expect(second.getByRole("heading", { name: "Saved views", exact: true })).toBeVisible();
  await expect(second.getByRole("note").filter({ hasText: "Save views" })).toHaveCount(0);
  await other.close();
});
