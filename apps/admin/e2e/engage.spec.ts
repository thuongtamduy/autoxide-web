import { expect, type Page, test } from "@playwright/test";

// Phân hệ Tiếp thị (biểu mẫu, bản tin, bình luận) với core giả (`mock-engage.ts`). Core giả có sẵn:
// form "Liên hệ" với 3 bài nộp mới, danh sách "Bản tin tuần" (1 người đã xác nhận), chiến dịch nháp
// "Bản tin tuần 46", hai bình luận chờ duyệt trên `demo.page/ve-sinh-thot-go`.

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

test("thanh bên có Tiếp thị; bài nộp đổi trạng thái có Hoàn tác", async ({ page }) => {
  await signIn(page, "/");
  await page
    .getByRole("navigation", { name: "Areas" })
    .getByRole("link", { name: "Marketing" })
    .click();
  // Khuyến mại (dữ liệu mẫu, W-015) đứng đầu nhóm: thanh bên mở nó; sang Biểu mẫu bằng menu con.
  await expect(page).toHaveURL(/\/marketing\/promotions$/);
  const subnav = page.getByRole("navigation", { name: /Marketing/ });
  await subnav.getByRole("link", { name: "Forms" }).click();
  await expect(page).toHaveURL(/\/marketing\/forms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Forms" })).toBeVisible();
  await expect(subnav.getByRole("link", { name: "Newsletter" })).toBeVisible();
  await expect(subnav.getByRole("link", { name: "Comments" })).toBeVisible();
  await expect(rows(page).first()).toContainText("Liên hệ");
  await expect(rows(page).first().locator('td[data-label="New"]')).toHaveText("3");

  await page.getByRole("link", { name: "Liên hệ" }).click();
  await expect(rows(page)).toHaveCount(3);
  // Số bài theo trạng thái của cả form (`submissions` của core) trên chip lọc.
  const chips = page.getByRole("navigation", { name: "Filter submissions" });
  await expect(chips.getByRole("link", { name: /New/ })).toContainText("3");
  await page.getByLabel("Search the answers").fill("chảo");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=ch/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Hồ Gia Bảo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hồ Gia Bảo/ })).toBeVisible();
  // Nhãn của lựa chọn theo đúng phiên bản form lúc gửi (`choices` của core), không theo form hiện
  // tại ("Partnership"), không hiện giá trị thô.
  await expect(page.getByText("Business partnership", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mark as read" }).click();
  await expect(toast(page)).toContainText("Marked as read.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Read");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("New");
});

test("tạo biểu mẫu: gom lỗi, lỗi của core dưới đúng thẻ, mã trùng dưới ô mã", async ({ page }) => {
  await signIn(page, "/marketing/forms");
  await page.getByRole("link", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/marketing\/forms\/new$/);
  // Có sẵn ba trường; xoá tên để thấy lỗi bắt buộc.
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByText("Enter a name for the form.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();

  await page.getByLabel("Name", { exact: true }).fill("Liên hệ mới");
  await expect(page.getByLabel("Form key")).toHaveValue("lien-he-moi");
  await page.getByLabel("New field type").selectOption("radio");
  await page.getByRole("button", { name: "Add field" }).click();
  const card = page.getByRole("listitem", { name: /Field 4/ });
  await card.getByLabel("Field key").fill("size");
  await card.getByLabel("Label (Vietnamese)").fill("Cỡ");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(card.locator(".ferr")).toHaveText("must have 1 to 100 options");

  await card.getByLabel("Choices").fill("s | Nhỏ | Small\nl | Lớn | Large");
  await page.getByLabel("Form key").fill("lien-he");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByText("This key is already used by another form.")).toBeVisible();
  await expect(page.getByLabel("Form key")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Form key").fill("lien-he-moi");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/marketing\/forms\/[0-9a-f-]{36}$/);
  await expect(toast(page)).toContainText("Form created.");
  await expect(page.getByRole("heading", { level: 1, name: /Liên hệ mới/ })).toBeVisible();

  // Đóng form có Hoàn tác.
  await page.getByRole("button", { name: "Close form" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Closed");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Open");
});

test("xuất CSV qua máy chủ của giao diện; dữ liệu theo email tra và xoá", async ({ page }) => {
  await signIn(page, "/marketing/forms");
  await page.getByRole("link", { name: "Liên hệ" }).click();
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(href).toMatch(/\/marketing\/forms\/[0-9a-f-]{36}\/export$/);
  const csv = await page.request.get(href ?? "");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toContain("lien-he-submissions.csv");
  expect(await csv.text()).toContain('"chau@example.com"');

  // Xuất chạy nền (form nhiều bài nộp): core xếp job, giao diện hỏi lại rồi hiện link tải qua máy chủ
  // của giao diện (trình duyệt không cần gọi thẳng tới core).
  await page.getByRole("button", { name: "Export in the background" }).click();
  const download = page.getByRole("link", { name: "Download the CSV file" });
  await expect(download).toBeVisible();
  const file = await page.request.get((await download.getAttribute("href")) ?? "");
  expect(file.headers()["content-disposition"]).toContain("lien-he-submissions.csv");
  expect(await file.text()).toContain('"chau@example.com"');

  await page.goto("/marketing/forms/data");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Enter an email address.")).toBeVisible();
  await page.getByLabel("Email address").fill("bao@example.com");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByRole("heading", { name: "Data of bao@example.com" })).toBeVisible();
  await expect(page.getByText(/lien-he/)).toBeVisible();
  await page.getByRole("button", { name: "Erase" }).click();
  await expect(dialog(page)).toContainText("deleted for good");
  await dialog(page).getByRole("button", { name: "Erase for good" }).click();
  await expect(toast(page)).toContainText("Data erased.");
  await expect(page.getByText("Nothing is stored for this address.")).toBeVisible();
});

test("bản tin: soạn, gửi thử (lỗi cấu hình hiện rõ), hẹn giờ, gửi ngay, tạm dừng có Hoàn tác", async ({
  page,
}) => {
  await signIn(page, "/marketing/newsletter");
  await expect(page.getByText("No open or click rates.")).toBeVisible();
  // Cấu hình gửi của máy chủ (`GET /newsletter/settings`).
  await expect(page.getByTestId("newsletter-setup")).toContainText("600 mails a minute");
  await page.getByRole("link", { name: "Compose campaign" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Enter a subject.")).toBeVisible();
  await expect(page.getByText("Write the text version of the mail.")).toBeVisible();
  await page.getByLabel("Subject", { exact: true }).fill("Ưu đãi chảo gang no-config");
  await page.getByLabel("Advertising mail").check();
  await expect(page.getByText("Sent as: [QC] Ưu đãi chảo gang no-config")).toBeVisible();
  await page.getByLabel("Text version").fill("Giảm 10% tới 30/11.");
  await page.getByLabel("HTML version (optional)").fill("<h1>Ưu đãi</h1><script>alert(1)</script>");
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.locator("iframe.eg-frame")).toHaveAttribute("sandbox", "");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/marketing\/newsletter\/campaigns\/[0-9a-f-]{36}$/);
  await expect(toast(page)).toContainText("Draft saved.");

  await page.getByRole("button", { name: "Send test" }).click();
  await dialog(page).getByLabel("Send to").fill("marketing@example.com");
  await dialog(page).getByRole("button", { name: "Send test" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "AUTOXIDE_NEWSLETTER_PREFERENCES_URL",
  );
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  // Thư như khi gửi: cùng lỗi cấu hình của core như khi gửi.
  await expect(page.locator(".note[data-code='newsletter.preferences_url_missing']")).toBeVisible();

  // Đổi tiêu đề (bản nháp sửa được ngay trên trang) rồi gửi thử được.
  await page.getByLabel("Subject", { exact: true }).fill("Ưu đãi chảo gang");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toContainText("Campaign saved.");
  // Bản xem trước của core: tiêu đề có nhãn quảng cáo, thư kèm chân thư.
  const asSent = page.getByTestId("campaign-preview");
  await expect(asSent).toContainText("[QC] Ưu đãi chảo gang");
  await asSent.getByText("Text version").click();
  await expect(asSent).toContainText("Huỷ đăng ký");
  await expect(page.locator(".kpi-label", { hasText: /^Bounced$/ })).toBeVisible();
  await expect(page.locator(".kpi-label", { hasText: /^Unsubscribed$/ })).toBeVisible();
  await page.getByRole("button", { name: "Send test" }).click();
  await dialog(page).getByLabel("Send to").fill("marketing@example.com");
  await dialog(page).getByRole("button", { name: "Send test" }).click();
  await expect(toast(page)).toContainText("Test mail sent.");

  await page.getByRole("button", { name: "Schedule" }).click();
  await dialog(page).getByLabel("Send at").fill("2030-01-02T08:00");
  await dialog(page).getByRole("button", { name: "Schedule" }).click();
  await expect(toast(page)).toContainText("Sending scheduled.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Scheduled");

  await page.getByRole("button", { name: "Send now" }).click();
  await expect(dialog(page)).toContainText("1 confirmed subscriber of Weekly gets it.");
  await expect(dialog(page)).toContainText("[QC]");
  await dialog(page).getByRole("button", { name: "Send now" }).click();
  await expect(toast(page)).toContainText("Sending started.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sending");

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Paused");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sending");
});

test("bản tin: tạo danh sách, nhập CSV kèm nguồn đồng ý, chặn và bỏ chặn", async ({ page }) => {
  await signIn(page, "/marketing/newsletter/lists");
  await expect(page.locator(".kpi").first()).toContainText("1");
  await page.getByRole("button", { name: "Create list" }).click();
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page).getByText("Enter a name in at least one language.")).toBeVisible();
  await dialog(page).getByLabel("Name (Vietnamese)").fill("Bản tin tuần");
  await dialog(page).getByLabel("Name (Vietnamese)").blur();
  await expect(dialog(page).getByLabel("Key")).toHaveValue("ban-tin-tuan");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page).getByText("This key is already used by another list.")).toBeVisible();
  await dialog(page).getByLabel("Name (Vietnamese)").fill("Công thức");
  await dialog(page).getByLabel("Key").fill("cong-thuc");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page)).toContainText("List created.");
  await expect(rows(page)).toHaveCount(2);

  await page.goto("/marketing/newsletter/subscribers");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await dialog(page).getByLabel("Or paste the lines").fill("email,name\nan@example.com,An\nsai\n");
  await dialog(page).getByRole("button", { name: "Import" }).click();
  await expect(dialog(page).getByText("Choose at least one list.")).toBeVisible();
  await expect(dialog(page).getByText("Say where these people agreed to get mail.")).toBeVisible();
  await dialog(page).getByText("Weekly").click();
  await dialog(page).getByLabel("Where they agreed").fill("hoi-cho-2026");
  await dialog(page).getByRole("button", { name: "Import" }).click();
  await expect(dialog(page).getByRole("status")).toContainText("1 new");
  await expect(dialog(page)).toContainText("Lines skipped (invalid or repeated address): 3.");
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("link", { name: "an@example.com" })).toBeVisible();

  await page.getByRole("link", { name: "hanh@example.com" }).click();
  await expect(page.getByText("Source: footer")).toBeVisible();
  await page.getByRole("button", { name: "Block" }).click();
  await dialog(page).getByLabel("Reason (optional)").fill("Asked by phone");
  await dialog(page).getByRole("button", { name: "Block" }).click();
  await expect(toast(page)).toContainText("Blocked.");
  await expect(page.getByRole("heading", { level: 2, name: "hanh@example.com" })).toBeVisible();
  // Lọc người bị chặn (`blocked=true` của core).
  await page.goto("/marketing/newsletter/subscribers");
  await page.getByRole("link", { name: "Blocked", exact: true }).click();
  await expect(page).toHaveURL(/blocked=1/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("link", { name: "hanh@example.com" }).click();
  await page.getByRole("button", { name: "Unblock" }).click();
  await expect(toast(page)).toContainText("Unblocked");
});

test("bình luận: duyệt ngay trên dòng có Hoàn tác; cấm người viết; đóng bài có Hoàn tác", async ({
  page,
}) => {
  await signIn(page, "/marketing/comments");
  await expect(rows(page)).toHaveCount(2);
  const row = rows(page).filter({ hasText: "Thớt bị nứt" });
  await expect(row).toContainText("First comment");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toContainText("Approved; the comment is shown now.");
  await expect(rows(page)).toHaveCount(1);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole("link", { name: "Mua dầu lau thớt ở đâu?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Minh Trí/ })).toBeVisible();
  await page.getByRole("button", { name: "Ban the author" }).click();
  await expect(dialog(page).getByLabel("Value")).toHaveValue("minh@example.com");
  await dialog(page).getByRole("button", { name: "Ban", exact: true }).click();
  await expect(dialog(page).getByText("Write why, for the records.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Quảng cáo nhiều lần");
  await dialog(page).getByRole("button", { name: "Ban", exact: true }).click();
  await expect(toast(page)).toContainText("Banned");
  await page.getByRole("button", { name: "Spam" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Spam");

  await page.goto("/marketing/comments/bans");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("minh@example.com");

  await page.goto("/marketing/comments/targets");
  await page.getByRole("link", { name: "ve-sinh-thot-go" }).click();
  await expect(page).toHaveURL(/\/marketing\/comments\/targets\/demo\.page\/ve-sinh-thot-go$/);
  await page.getByRole("button", { name: "Close comments" }).click();
  await expect(page.locator(".eg-detailhead")).toContainText("Closed");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".eg-detailhead")).toContainText("Open");
});

test("bình luận theo bài: danh sách đích của core kèm số đếm; tiêu đề của bài đang công khai", async ({
  page,
}) => {
  await signIn(page, "/marketing/comments/targets");
  await expect(rows(page)).toHaveCount(2);
  const post = rows(page).filter({ hasText: "Vệ sinh thớt gỗ đúng cách" });
  await expect(post.locator('td[data-label="Shown"]')).toHaveText("1");
  // Đích không module nào mô tả (`demo.page`) hiện id.
  await expect(page.getByRole("link", { name: "ve-sinh-thot-go", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Waiting for approval" }).click();
  await expect(page).toHaveURL(/pending=1/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("demo.page");

  // Chi tiết bình luận: tiêu đề và địa chỉ của bài qua sổ đối tượng của core.
  await page.goto("/marketing/comments?status=published");
  await page.getByRole("link", { name: /Cảm ơn/ }).click();
  await expect(page.getByText("/blog/ve-sinh-thot-go-dung-cach")).toBeVisible();
  await expect(page.getByRole("link", { name: "Vệ sinh thớt gỗ đúng cách" })).toBeVisible();
  await page.getByRole("link", { name: "Open the post" }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
});

test("cài đặt bình luận: của máy chủ đọc từ core; theo khách là dữ liệu mẫu có nhãn", async ({
  page,
}) => {
  await signIn(page, "/marketing/comments/settings");
  await expect(page.getByText("AUTOXIDE_COMMENTS_*", { exact: false })).toBeVisible();
  await expect(page.locator("[data-sample]")).toHaveText(
    "Sample data · waiting for API step 33 · 37",
  );
  await page.getByLabel("Account verification to comment").selectOption("phone");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Guests cannot verify an account")).toBeVisible();
  await page.getByLabel("Guests without an account may comment").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(toast(page)).toContainText("Settings saved (sample data).");

  await page.getByLabel("Name shown on your comments").fill("Ban biên tập");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(toast(page)).toContainText("Display name saved.");
});

test("trên điện thoại: hàng chờ thành thẻ có nhãn cột, nút chính đứng đầu, không tràn ngang", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/marketing/comments");
  await expect(page.locator("thead")).toBeHidden();
  await expect(rows(page).first().locator('td[data-label="Status"]')).toBeVisible();
  const approve = await rows(page).first().getByRole("button", { name: "Approve" }).boundingBox();
  expect(approve && approve.height >= 44).toBe(true);

  await page.goto("/marketing/forms");
  await page.getByRole("link", { name: "Liên hệ" }).click();
  const edit = await page.getByRole("link", { name: "Edit form" }).boundingBox();
  const csv = await page.getByRole("link", { name: "Export CSV" }).boundingBox();
  expect(edit && csv && edit.y < csv.y).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
