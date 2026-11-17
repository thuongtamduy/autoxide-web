import { expect, type Page, test } from "@playwright/test";

// Bộ công cụ bảng (W-058) ở các màn Cài đặt, Tổ chức, Khách hàng, Tài chính, Tuân thủ: chọn nhiều +
// thanh hàng loạt (core thật lặp lệnh từng cái, gom lỗi theo dòng), menu "⋯" trên dòng, sắp theo cột
// chỉ khi nguồn sắp được (core: `order` theo thời gian), phân trang có tổng chỉ khi nguồn có tổng (dữ
// liệu mẫu). Người dùng, tài khoản người mua, webhook, audit, role đi qua core giả; Job, Sổ cái, Yêu cầu
// chủ thể là dữ liệu mẫu (có thể đã bị spec khác đổi, nên chỉ kiểm điều không phụ thuộc thứ tự chạy).

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
const rows = (page: Page) => page.locator("tbody tr");
const bar = (page: Page) => page.locator(".bulkbar");

test("người dùng: sắp theo ngày tạo (order của core), ⋯ trên dòng, khoá hàng loạt gom lỗi của core", async ({
  page,
}) => {
  await signIn(page, "/org/access/users");
  const created = page.getByRole("columnheader", { name: "Created" });
  await expect(created).toHaveAttribute("aria-sort", "descending");
  await created.getByRole("link").click();
  await expect(page).toHaveURL(/sort=created&dir=asc/);
  await expect(page.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(rows(page).first()).toContainText("admin@example.com");

  // ⋯: mở, đổi role, khoá (chưa khoá) — không có nút lặp trên dòng.
  await page.getByRole("button", { name: "More actions for viewer" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Open",
    "Change roles",
    "Disable",
  ]);
  await page.keyboard.press("Escape");

  // Chọn admin và viewer: core từ chối khoá quản trị viên cuối cùng, dòng đó vẫn được chọn.
  await page.getByRole("checkbox", { name: "Select admin" }).check();
  await page.getByRole("checkbox", { name: "Select viewer" }).check();
  await bar(page).getByRole("button", { name: "Disable" }).click();
  await expect(dialog(page)).toContainText("Disable the selected accounts?");
  await expect(dialog(page)).toContainText("Applies to 2 rows.");
  await dialog(page).getByRole("button", { name: "Disable account" }).click();
  await expect(toast(page)).toContainText("Done 1/2, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText(
    "admin: This change would leave no active user with the `admin` role.",
  );
  await expect(bar(page)).toContainText("1 selected");
  await bar(page).getByRole("button", { name: "Clear selection" }).click();
  const viewer = rows(page).filter({ hasText: "viewer@example.com" });
  await expect(viewer).toContainText("Disabled");

  // Mở khoá trong ⋯ có Hoàn tác.
  await viewer.getByRole("button", { name: "More actions for viewer" }).click();
  await page.getByRole("menuitem", { name: "Enable" }).click();
  await expect(toast(page)).toContainText("Account enabled.");
  await expect(viewer).not.toContainText("Disabled");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(viewer).toContainText("Disabled");

  // Role: role dựng sẵn không có ô chọn, ⋯ chỉ có "Mở".
  await page.goto("/org/access/roles");
  await expect(page.getByRole("checkbox", { name: "Select admin" })).toHaveCount(0);
  await page.getByRole("button", { name: "More actions for admin" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Open"]);
});

test("tài khoản người mua: khoá / mở hàng loạt (lặp PATCH từng cái), sắp theo ngày đăng ký", async ({
  page,
}) => {
  await signIn(page, "/customers/accounts");
  await expect(rows(page).first()).toContainText("Nguyễn Thu Hà");
  await page.getByRole("columnheader", { name: "Registered" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=registered&dir=asc/);
  await expect(rows(page).first()).toContainText("Trần Minh Đức");

  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Lock", exact: true }).click();
  await expect(dialog(page)).toContainText("Lock the selected accounts?");
  await dialog(page).getByRole("button", { name: "Lock" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page).filter({ hasText: "Locked" })).toHaveCount(2);

  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Unlock" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page).filter({ hasText: "Locked" })).toHaveCount(0);
});

test("webhook: tắt hàng loạt, ⋯ bật lại có Hoàn tác, xoá hàng loạt có hỏi lại; audit sắp theo thời điểm", async ({
  page,
}) => {
  await signIn(page, "/settings/webhooks");
  for (const url of ["https://a.example.com/in", "https://b.example.com/in"]) {
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await dialog(page).getByLabel("Address").fill(url);
    await dialog(page).getByLabel("Every event").check();
    await dialog(page).getByRole("button", { name: "Add endpoint" }).click();
    await dialog(page).getByRole("button", { name: "I have stored it" }).click();
  }
  await page.goto("/settings/webhooks");
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Turn off" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page).filter({ hasText: "Turned off" })).toHaveCount(2);

  const a = rows(page).filter({ hasText: "a.example.com/in" });
  await a.getByRole("button", { name: "More actions for a.example.com/in" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Open",
    "Turn on",
    "Delete",
  ]);
  await page.getByRole("menuitem", { name: "Turn on" }).click();
  await expect(toast(page)).toContainText("Endpoint turned on.");
  await expect(a).toContainText("Receiving");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(a).toContainText("Turned off");

  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Delete the selected endpoints?");
  await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Delete endpoint" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByRole("heading", { name: "No endpoints here." })).toBeVisible();

  // Nhật ký audit: chỉ đọc, sắp theo thời điểm bằng `order` của core (mục cũ nhất của sổ giả là
  // `auth.user_updated`).
  await page.goto("/settings/audit");
  const when = page.getByRole("columnheader", { name: "When" });
  await expect(when).toHaveAttribute("aria-sort", "descending");
  await when.getByRole("link").click();
  await expect(page).toHaveURL(/sort=when&dir=asc/);
  await expect(rows(page).first()).toContainText("auth.user_updated");
  await expect(page.locator("table").getByRole("checkbox")).toHaveCount(0);
});

test("dữ liệu mẫu: job chạy lại hàng loạt gom lỗi, sổ cái phân trang có tổng và ⋯, yêu cầu chủ thể một nút + ⋯", async ({
  page,
}) => {
  // Job đang chạy không chạy lại được: mỗi dòng một lỗi, phân trang có tổng.
  await signIn(page, "/settings/jobs?status=running");
  const count = await rows(page).count();
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(
    `1–${count} of ${count}`,
  );
  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Retry" }).click();
  await expect(dialog(page)).toContainText("Retry the selected jobs?");
  await dialog(page).getByRole("button", { name: "Retry job" }).click();
  await expect(toast(page)).toContainText(`Done 0/${count}`);
  await expect(bar(page).getByRole("alert")).toContainText(
    "Only a job in the dead-letter queue can be retried.",
  );

  // Sổ cái: sắp theo số tiền, "1–N of N", ⋯ mở chi tiết của dòng.
  await page.goto("/finance");
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/^1–\d+ of \d+/);
  await page.getByRole("columnheader", { name: "Amount" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=amount&dir=desc/);
  await rows(page)
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Show details" }).click();
  await expect(page.locator(".cat-detail")).toBeVisible();
  await expect(page).toHaveURL(/sort=amount&dir=desc&open=/);

  // Yêu cầu chủ thể: dòng còn mở hiện đúng một nút, từ chối trong ⋯ (hộp thoại vẫn hiện khi menu đóng).
  await page.goto("/compliance/records/requests");
  const open = rows(page)
    .filter({ has: page.getByRole("button", { name: /^More actions for / }) })
    .first();
  await expect(open.locator("td.rt-acts button:visible:not(.rmenu-btn)")).toHaveCount(1);
  await open.getByRole("button", { name: /^More actions for / }).click();
  await page.getByRole("menuitem", { name: "Reject with reason" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(dialog(page)).toContainText("Reason");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
});
