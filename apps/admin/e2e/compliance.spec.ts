import { expect, type Page, test } from "@playwright/test";

// Phân hệ Tuân thủ: cả hai màn là dữ liệu mẫu (W-006, W-012), chờ module `compliance` của bước 37.
// Phần thật: trang nguồn của văn bản pháp lý và bài có nhãn AI đọc từ core giả (`content`), link
// sang các tab "dữ liệu theo email" thật của Biểu mẫu, Bản tin, Bình luận. Kho mẫu nằm trong tiến
// trình máy chủ của giao diện, nên mỗi test làm trên bản ghi riêng.

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
  await request.post(`${CORE}/__content/legal`);
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

test("tình trạng: thanh bên có Tuân thủ; hồ sơ Bộ Công Thương ghi nộp và kết quả có hộp xác nhận", async ({
  page,
}) => {
  await signIn(page, "/");
  await page
    .getByRole("navigation", { name: "Areas" })
    .getByRole("link", { name: "Compliance" })
    .click();
  await expect(page).toHaveURL(/\/compliance$/);
  await expect(page.getByRole("heading", { level: 1, name: "Compliance status" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 37")).toBeVisible();
  await expect(page.getByRole("link", { name: /E-commerce websites/ }).first()).toBeVisible();
  // Bộ quy định: căn cứ có ngày hiệu lực và lời nhắc đối chiếu.
  await expect(page.locator("tbody tr", { hasText: "kyc.required_activities" })).toContainText(
    "Luật Thương mại điện tử 122/2025/QH15",
  );

  await page
    .getByRole("link", { name: /^E-commerce websites/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/compliance\/websites$/);
  const market = page.locator(".cp-site", { hasText: "cho.bepmoc.example.com" });
  await expect(market).toContainText("Register with the Ministry of Industry and Trade");
  await expect(market.locator("li", { hasText: "Marketplace operating rules" })).toContainText(
    "a draft exists but is not published",
  );
  await expect(market.getByRole("link", { name: "Download dossier" })).toHaveAttribute(
    "href",
    /\/compliance\/websites\/.+\/dossier$/,
  );

  await market.getByRole("button", { name: "Record submission" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("cannot be undone");
  await dialog(page).getByRole("button", { name: "Record submission" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await expect(dialog(page).getByText("Tick this box to confirm.")).toBeVisible();
  await dialog(page).getByLabel("Dossier number on the portal").fill("HS-2611-0001");
  await dialog(page)
    .getByLabel(/I submitted this dossier/)
    .check();
  await dialog(page).getByRole("button", { name: "Record submission" }).click();
  await expect(toast(page)).toHaveText("Submission recorded for cho.bepmoc.example.com.");
  await expect(market).toContainText("Submitted, waiting");

  await market.getByRole("button", { name: "Record result" }).click();
  await dialog(page).getByLabel("Result", { exact: true }).selectOption("registered");
  await dialog(page).getByLabel("Logo link").fill("https://example.com/logo");
  await dialog(page).getByRole("button", { name: "Save result" }).click();
  await expect(
    dialog(page)
      .getByText(/starts with https:\/\/online\.gov\.vn/)
      .last(),
  ).toBeVisible();
  await dialog(page).getByLabel("Logo link").fill("https://online.gov.vn/Home/WebDetails/1");
  await dialog(page).getByLabel("Logo image address").fill("https://online.gov.vn/logo.png");
  await dialog(page).getByRole("button", { name: "Save result" }).click();
  await expect(toast(page)).toHaveText("Result recorded.");
  await expect(market).toContainText("Registered");
});

test("KYC, sự cố 72 giờ, bằng chứng văn bản", async ({ page }) => {
  await signIn(page, "/compliance/kyc");
  const row = page.locator("tbody tr", { hasText: "Bếp Nhà Thỏ" });
  await row.getByRole("button", { name: "Return with reason" }).click();
  await dialog(page).getByRole("button", { name: "Return profile" }).click();
  await expect(dialog(page).getByLabel("Reason")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("name_mismatch");
  await dialog(page).getByRole("button", { name: "Return profile" }).click();
  await expect(toast(page)).toHaveText("Profile of Bếp Nhà Thỏ returned.");
  await expect(row).toHaveCount(0);
  const na = page.locator("tbody tr", { hasText: "Gia Dụng Nhà Na" });
  await na.getByRole("button", { name: "Approve" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("list products and sell");
  await dialog(page).getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toHaveText("Gia Dụng Nhà Na is verified and can sell now.");

  await page.getByRole("link", { name: /^Personal data/ }).click();
  await page.getByRole("button", { name: "Record an incident" }).click();
  const submit = dialog(page).getByRole("button", { name: "Record and start the 72-hour clock" });
  await submit.click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByLabel("Contact details (email, phone)").check();
  await dialog(page).getByLabel("Short description").fill("Tệp xuất đơn hàng để công khai nhầm");
  await submit.click();
  await expect(toast(page)).toHaveText("Incident recorded; administrators were told.");
  const incident = page.locator(".cp-incident");
  await expect(incident).toContainText(/7[01] h \d+ min left/);
  await incident.getByRole("button", { name: "Record notice to authority" }).click();
  await dialog(page).getByRole("button", { name: "Record notice to authority" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByLabel("Reference of the notice sent").fill("[SỐ VĂN BẢN MẪU]");
  await dialog(page).getByRole("button", { name: "Record notice to authority" }).click();
  await expect(toast(page)).toHaveText("Notice to the authority recorded.");
  await incident.getByRole("button", { name: "Close incident" }).click();
  await dialog(page).getByRole("button", { name: "Close incident" }).click();
  await expect(toast(page)).toContainText("Incident closed");
  await expect(page.getByText("No open incident")).toBeVisible();

  await page.getByRole("link", { name: /^Legal documents/ }).click();
  await expect(page.locator(".item", { hasText: "Hợp đồng người bán" })).toContainText(
    "1 has not accepted",
  );
});

test("hồ sơ: lỗi theo ô, mục đích có Hoàn tác, phát hành văn bản từ trang thật, yêu cầu chủ thể", async ({
  page,
}) => {
  await signIn(page, "/compliance/records");
  await expect(
    page.getByRole("heading", { level: 1, name: "Records and personal data" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Export processing register" })).toBeVisible();
  // Mã số thuế mẫu không hợp lệ: báo dưới đúng ô.
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter 10 digits, or 10 digits, a dash and 3 digits.")).toBeVisible();
  await expect(page.getByLabel("Tax code")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Tax code").fill("0000000000");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(toast(page)).toHaveText("Saved; the footer and page templates use the new details.");

  await page.getByRole("link", { name: "Processing purposes", exact: true }).click();
  const marketing = page.locator("tbody tr", { hasText: "Send promotions" });
  await marketing.getByRole("button", { name: "Turn off" }).click();
  await expect(marketing).toContainText("Turned off");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toHaveText("Change undone.");
  await expect(marketing).toContainText("In use");
  await expect(
    page.locator("tbody tr", { hasText: "Invoices and accounting records" }),
  ).toContainText("Required by law");

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const rules = page.locator("tbody tr", { hasText: "Quy chế Chợ Bếp Mộc" });
  await rules.getByRole("button", { name: "Publish new version" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("cannot be edited or deleted");
  await dialog(page).getByRole("button", { name: "Publish version" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByLabel("Source page").selectOption({ label: "Quy chế Chợ Bếp Mộc · vi" });
  await dialog(page)
    .getByLabel(/a published version cannot be changed/)
    .check();
  await dialog(page).getByRole("button", { name: "Publish version" }).click();
  await expect(toast(page)).toHaveText(
    "Published; the new version takes effect on the chosen date.",
  );
  await expect(rules).toContainText("Version 3");

  await page.getByRole("link", { name: "AI labels", exact: true }).click();
  await expect(page.locator("tbody tr", { hasText: "Cách chăm chảo gang mới mua" })).toContainText(
    "AI-generated",
  );

  await page.getByRole("link", { name: "Subject requests", exact: true }).click();
  await page.getByRole("button", { name: "Record request" }).click();
  await dialog(page).getByLabel("Requester (email or phone)").fill("abc");
  await dialog(page).getByRole("button", { name: "Record request" }).click();
  await expect(dialog(page).getByText("Enter an email address or a phone number.")).toBeVisible();
  await dialog(page).getByLabel("Requester (email or phone)").fill("nguoi.mua@example.com");
  await dialog(page).getByLabel("What they asked for").fill("Xin xoá dữ liệu đăng ký bản tin");
  await dialog(page).getByLabel("Request", { exact: true }).selectOption("erase");
  await dialog(page).getByRole("button", { name: "Record request" }).click();
  await expect(toast(page)).toHaveText("Request recorded; the deadline comes from the rule set.");
  await expect(page.locator("tbody tr", { hasText: "nguoi.mua@example.com" })).toContainText(
    "Received",
  );
  // Tra và xoá theo email dẫn tới các tab thật của các module đã cài.
  await page.getByRole("link", { name: "Newsletter: data by email" }).click();
  await expect(page).toHaveURL(/\/marketing\/newsletter\/data$/);
});

test("điện thoại: bảng thành thẻ có nhãn cột, không tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/compliance/records/requests");
  const first = page.locator("tbody tr").first();
  await expect(first.locator("td[data-label]").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBe(0);
});
