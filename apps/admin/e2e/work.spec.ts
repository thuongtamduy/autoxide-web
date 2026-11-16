import { expect, type Page, test } from "@playwright/test";

// Tổng quan và màn "Việc và hoạt động" (W-020). Việc của bình luận, biểu mẫu, bài chờ duyệt và hoạt động
// gần đây đọc từ core giả; việc của phân hệ chưa có API, hoãn, giao, ghim, chạy thử đọc dữ liệu mẫu
// (kho trong tiến trình máy chủ của giao diện: các bước nối nhau trong cùng một test).

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(
  page: Page,
  path: string,
  email = "admin@example.com",
  password = "admin password",
) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");

test("tổng quan: lời chào, số liệu ghi nguồn, hộp việc rút gọn, thiết lập, hoạt động", async ({
  page,
}) => {
  await signIn(page, "/");
  await expect(
    page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), admin$/ }),
  ).toBeVisible();

  // Số liệu: ô của module có API ghi "API thật", ô của phân hệ chưa có API ghi bước đang chờ.
  const review = page.locator(".dash-tile", { hasText: "Posts awaiting review" });
  await expect(review).toContainText("1");
  await expect(review).toContainText("Real API · module content");
  const revenue = page.locator(".dash-tile", { hasText: "Revenue today" });
  await expect(revenue).toContainText("Sample data · waiting for API step 45");

  // Hộp việc rút gọn: tối đa 8 việc gấp nhất, có lối sang màn đầy đủ.
  const box = page.locator(".dash-tasks");
  await expect(box.locator(".wk-task")).toHaveCount(8);
  await expect(box.getByRole("link", { name: /^See all \d+ items$/ })).toBeVisible();

  // Thiết lập: bước pháp lý chưa xong có nhãn "Required by law".
  const setup = page.locator(".dash-card", { hasText: "Setup steps" });
  await expect(setup.getByText("Required by law").first()).toBeVisible();
  await expect(setup.getByRole("link", { name: "Do it: Pages required by law" })).toBeVisible();

  // Hoạt động gần đây đọc từ nhật ký audit của core giả.
  await expect(page.getByText("The system edited a user")).toBeVisible();

  // Menu con của Tổng quan có số việc đang chờ.
  const sub = page.getByRole("navigation", { name: "Overview", exact: true });
  await expect(sub.getByRole("link", { name: /^Work and activity\s*\d+$/ })).toBeVisible();
});

test("việc cần làm: hoãn và giao có Hoàn tác, lọc theo trạng thái; việc thật của core", async ({
  page,
}) => {
  await signIn(page, "/work");
  await expect(page.getByRole("heading", { level: 1, name: "Work and activity" })).toBeVisible();
  // Việc đọc từ core thật (bài chờ duyệt của module content) không có nhãn "sample".
  const real = page.locator(".wk-task", { hasText: "1 post awaiting review" });
  await expect(real).toBeVisible();
  await expect(real.locator(".b-sample")).toHaveCount(0);
  await expect(real.getByRole("link", { name: "Review" })).toHaveAttribute("href", /\/content\//);

  // Hoãn tới 9:00 sáng mai: rời "Waiting", sang "Snoozed"; Hoàn tác đưa về.
  const kyc = page.locator(".wk-task", { hasText: "identity checks (KYC) awaiting review" });
  await kyc.getByRole("button", { name: /^Snooze: / }).click();
  await dialog(page).getByLabel("Bring back at").selectOption("tomorrow");
  await dialog(page).getByRole("button", { name: "Snooze" }).click();
  await expect(toast(page)).toContainText("Work snoozed");
  await page.getByRole("link", { name: /^Waiting/ }).click();
  await expect(page.locator(".wk-task", { hasText: "identity checks (KYC)" })).toHaveCount(0);
  await page.getByRole("link", { name: /^Snoozed\s*1$/ }).click();
  await expect(page.locator(".wk-task", { hasText: "identity checks (KYC)" })).toBeVisible();
  await page.getByRole("button", { name: /^Unsnooze: / }).click();
  await expect(toast(page)).toContainText("The work is back");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  await page.reload();
  await expect(page.locator(".wk-task", { hasText: "identity checks (KYC)" })).toBeVisible();

  // Giao cho người có quyền (admin có mọi permission); nhãn "Assigned to" hiện trên việc.
  await page.goto("/work");
  const cod = page.locator(".wk-task", { hasText: "Cash on delivery off by" });
  await cod.getByRole("button", { name: /^Assign: / }).click();
  await dialog(page).getByLabel("Assign to").selectOption({ label: "admin" });
  await dialog(page).getByRole("button", { name: "Assign" }).click();
  await expect(toast(page)).toContainText("Work assigned");
  await expect(cod.getByText("Assigned to admin")).toBeVisible();
  await page.getByRole("link", { name: /^Assigned\s*1$/ }).click();
  await expect(page.locator(".wk-task")).toHaveCount(1);
});

test("hoạt động, ghim có Hoàn tác, chạy thử rồi chạy thật, tuỳ chọn thông báo", async ({
  page,
}) => {
  await signIn(page, "/work/activity");
  await expect(page.getByText("The system edited a user")).toBeVisible();

  await page.getByRole("link", { name: "Pinned" }).click();
  await expect(page.getByText("Sample data · waiting for a new API")).toBeVisible();
  await page.getByRole("button", { name: "Unpin: Gia Dụng Nhà Na" }).click();
  await expect(toast(page)).toContainText("Unpinned");
  await expect(page.getByText("Seller Gia Dụng Nhà Na")).toHaveCount(0);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Pinned again");
  await expect(page.getByText("Seller Gia Dụng Nhà Na")).toBeVisible();

  // Chạy thử không đổi gì; chạy thật hỏi lại, nêu hệ quả, rồi không còn gì "sẽ áp dụng".
  await page.getByRole("link", { name: "Preview a bulk action" }).click();
  await page.getByLabel("Change to tax group").selectOption("vat.standard");
  await page.getByRole("button", { name: "Dry run" }).click();
  const willApply = page.locator(".kpi", { hasText: "Will apply" });
  await expect(willApply.locator(".kpi-value")).not.toHaveText("0");
  await page.getByRole("button", { name: "Run for real" }).click();
  await expect(dialog(page)).toContainText("There is no undo for the whole batch");
  await dialog(page).getByRole("button", { name: "Run for real" }).click();
  await expect(toast(page)).toContainText("The action has run");
  await expect(willApply.locator(".kpi-value")).toHaveText("0");
  await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();

  await page.getByRole("link", { name: "Notification settings" }).click();
  const digest = page.getByLabel("Daily summary");
  await expect(digest).not.toBeChecked();
  await digest.check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(toast(page)).toContainText("Notification settings saved");
  await page.reload();
  await expect(page.getByLabel("Daily summary")).toBeChecked();
});

test("người không có permission nào: hộp việc trống, không lộ việc của phân hệ khác", async ({
  page,
}) => {
  await signIn(page, "/work", "viewer@example.com", "viewer password");
  await expect(page.getByText("Nothing left.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();
  await expect(page.locator(".dash-tile")).toHaveCount(0);
});
