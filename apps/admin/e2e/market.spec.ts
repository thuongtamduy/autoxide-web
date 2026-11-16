import { expect, type Page, test } from "@playwright/test";

// Sàn (bước 46) dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-018): màn Vận hành sàn và Trung tâm người
// bán (không gian thứ ba). Kho mẫu nằm trong tiến trình máy chủ của giao diện và dùng chung với Tuân
// thủ mẫu (KYC, văn bản), nên test chỉ dựa vào người bán mà các test khác không đụng tới.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");
const row = (page: Page, text: string) => page.locator("tbody tr", { hasText: text }).first();

test("người bán: KYC duyệt ở Tuân thủ, người bán gửi hồ sơ, sàn duyệt; tạm khoá có Hoàn tác", async ({
  page,
}) => {
  await signIn(page, "/market");
  await expect(
    page.getByRole("heading", { level: 1, name: "Marketplace operations" }),
  ).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 46")).toBeVisible();

  // Dao Kéo chưa xác thực danh tính: chưa được bán, dẫn sang Tuân thủ.
  await row(page, "Dao Kéo Đa Sỹ Truyền Thống").getByRole("link").first().click();
  const detail = page.locator(".cat-detail");
  await expect(detail).toContainText("Cannot sell yet: conditions");
  await expect(detail).toContainText("Being checked on the Compliance screen");

  // Duyệt KYC ở màn Tuân thủ (nơi duy nhất duyệt định danh).
  await page.goto("/compliance/kyc");
  await row(page, "Dao Kéo Đa Sỹ Truyền Thống").getByRole("button", { name: "Approve" }).click();
  await dialog(page).getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toContainText("Dao Kéo Đa Sỹ Truyền Thống");

  // Xem như người bán: băng nói rõ là chế độ thử; người bán gửi hồ sơ.
  await page.goto("/market?status=pending_verification");
  await row(page, "Dao Kéo Đa Sỹ Truyền Thống").getByRole("link").first().click();
  await page.getByRole("button", { name: "View as this seller" }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByText("You are viewing as Dao Kéo Đa Sỹ Truyền Thống.")).toBeVisible();
  await expect(page.locator(".cp-check")).toContainText("Verified by eKYC partner");
  await page.getByRole("button", { name: "Send application for review" }).click();
  await dialog(page).getByRole("button", { name: "Send application for review" }).click();
  await expect(toast(page)).toHaveText("Application sent; the marketplace reviews it.");
  await page.getByRole("button", { name: "Leave seller view" }).click();
  await expect(page).toHaveURL(/\/market$/);

  // Sàn duyệt hồ sơ: hộp xác nhận nêu hệ quả.
  await page.goto("/market?status=pending_review");
  await row(page, "Dao Kéo Đa Sỹ Truyền Thống").getByRole("link").first().click();
  await page.getByRole("button", { name: "Approve application" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("receive payouts");
  await dialog(page).getByRole("button", { name: "Approve application" }).click();
  await expect(toast(page)).toHaveText(
    "Approved Dao Kéo Đa Sỹ Truyền Thống; the seller can sell from now on.",
  );

  // Tạm khoá: lý do bắt buộc (lỗi dưới ô), đảo được nên có Hoàn tác.
  await page.goto("/market?status=active");
  await row(page, "Gốm Sứ Bát Tràng Xưa").getByRole("link").first().click();
  await page.getByRole("button", { name: "Suspend" }).click();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(dialog(page).getByLabel("Reason")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog(page).getByText("Write 10 to 500 characters.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Kiểm tra báo cáo hàng giả của người mua");
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(toast(page)).toContainText("Suspended Gốm Sứ Bát Tràng Xưa.");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toHaveText("Change undone.");
});

test("duyệt sản phẩm, phí có ngày hiệu lực, lệnh chi qua đối tác, phân xử tranh chấp", async ({
  page,
}) => {
  await signIn(page, "/market/listings");
  // Hàng có điều kiện thiếu giấy tờ: phát hiện tự động, không duyệt được.
  const salt = row(page, "Muối ớt tôm Tây Ninh 200 g");
  await expect(salt).toContainText("missing Product self-declaration");
  await salt.getByRole("button", { name: "Approve" }).click();
  await expect(salt).toContainText("Papers required for this category are missing.");
  // Duyệt được thì có Hoàn tác.
  await row(page, "Bát gốm men lam (bộ 6)").getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toContainText("Approved Bát gốm men lam (bộ 6)");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toHaveText("Change undone.");

  // Phí: dòng mới từ ngày mai; mức sai báo dưới ô.
  await page.getByRole("link", { name: "Fees", exact: true }).click();
  await page.getByRole("button", { name: "Add a fee line" }).click();
  await dialog(page).getByLabel("Rate (%)").fill("50");
  await dialog(page).getByRole("button", { name: "Add line" }).click();
  await expect(
    dialog(page).getByText("Enter a percentage from 0 to 30, such as 6 or 5.5."),
  ).toBeVisible();
  await dialog(page).getByLabel("Rate (%)").fill("5.5");
  await dialog(page).getByRole("button", { name: "Add line" }).click();
  await expect(toast(page)).toContainText("Fee line added");
  await expect(row(page, "5.5% (VAT included)")).toContainText("Scheduled");
  // Tính thử theo số của bản thiết kế: 690.000 ₫, hộ kinh doanh, hoa hồng 6%.
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.locator(".mk-preview-result")).toContainText("638,250 ₫");

  // Chi trả: sàn không giữ tiền; gửi lệnh chi hỏi lại, đối tác báo đã chi sau vài giây.
  await page.getByRole("link", { name: "Payouts", exact: true }).click();
  await expect(page.getByText("The marketplace does not hold money.")).toBeVisible();
  const gom = page.locator("tbody tr", { hasText: "Gốm Sứ Bát Tràng Xưa" }).filter({
    hasText: "Being built",
  });
  await gom.getByRole("button", { name: "Send payout" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("cannot be pulled back");
  await dialog(page).getByRole("button", { name: "Send payout" }).click();
  await expect(toast(page)).toContainText("Payout sent");
  await expect(async () => {
    await page.reload();
    await expect(
      page.locator("tbody tr", { hasText: "Gốm Sứ Bát Tràng Xưa" }).filter({ hasText: "Paid" }),
    ).toHaveCount(2);
  }).toPass({ timeout: 15_000 });

  // Tranh chấp: phân xử nêu hệ quả; số hoàn không vượt số đã trả; mọi lỗi dưới ô.
  await page.getByRole("link", { name: /^Disputes/ }).click();
  const tc = row(page, "TC-2611-0031");
  await tc.getByRole("button", { name: "Decide" }).click();
  await expect(dialog(page).locator(".dlg-list")).toContainText("cannot be undone");
  await dialog(page).getByRole("button", { name: "Record decision" }).click();
  await expect(dialog(page).getByLabel("Decision")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Decision").selectOption("refund_partial");
  await dialog(page).getByLabel("Refund amount (₫)").fill("999999");
  await dialog(page).getByLabel("Reason sent to both sides").fill("Hai chiếc vỡ trong bộ sáu");
  await dialog(page).getByLabel("I understand a refund cannot be undone").check();
  await dialog(page).getByRole("button", { name: "Record decision" }).click();
  await expect(
    dialog(page).getByText("The refund cannot exceed what the buyer paid for this order."),
  ).toBeVisible();
  await dialog(page).getByLabel("Refund amount (₫)").fill("200000");
  await dialog(page).getByLabel("I understand a refund cannot be undone").check();
  await dialog(page).getByRole("button", { name: "Record decision" }).click();
  await expect(toast(page)).toHaveText("Decision recorded; both sides are told.");
  await expect(tc).toContainText("Resolved");
});

test("trung tâm người bán: không gian riêng, trả lời tranh chấp, tài khoản nhận tiền, sao kê", async ({
  page,
}) => {
  await signIn(page, "/seller");
  // Quản trị viên chưa chọn gian hàng: chọn để "xem như", không phải quyền của người bán.
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose a shop to view as its seller" }),
  ).toBeVisible();
  await row(page, "Khăn Bông Hạ Long").getByRole("button", { name: "View as this seller" }).click();
  await expect(page.getByText("You are viewing as Khăn Bông Hạ Long.")).toBeVisible();
  // Thanh bên rút gọn của người bán, không có phân hệ của khách.
  const rail = page.locator("nav.rail");
  await expect(rail.getByRole("link", { name: "Money" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Marketplace" })).toHaveCount(0);

  // Tranh chấp của chính gian hàng: trả lời ngắn quá thì báo dưới ô.
  await page.goto("/seller/orders/disputes");
  await page.getByRole("button", { name: "Answer with evidence" }).click();
  await dialog(page).getByLabel("Your answer").fill("ngắn");
  await dialog(page).getByRole("button", { name: "Send answer" }).click();
  await expect(dialog(page).getByText("Write 10 to 2000 characters.")).toBeVisible();
  await dialog(page).getByLabel("Your answer").fill("Shop có video đóng gói đủ 3 bộ khăn.");
  await dialog(page).getByRole("button", { name: "Send answer" }).click();
  await expect(toast(page)).toHaveText("Answer sent; the buyer has 48 hours to reply.");

  // Tài khoản nhận tiền: số sai báo dưới ô; lưu xong chỉ hiện 4 số cuối, ô số để trống.
  await page.goto("/seller/shop");
  await page.getByLabel("Account number").fill("12ab");
  await page.getByRole("button", { name: "Save payout account" }).click();
  await expect(page.getByText("Enter 6 to 19 digits.")).toBeVisible();
  await page.getByLabel("Account number").fill("0123 4567 8901");
  await page.getByRole("button", { name: "Save payout account" }).click();
  await expect(toast(page)).toHaveText("Payout account saved.");
  await expect(page.getByText(/ending in 8901/)).toBeVisible();
  await expect(page.getByLabel("Account number")).toHaveValue("");

  // Sao kê chỉ có đơn của gian hàng này.
  await page.goto("/seller/money");
  await expect(page.getByText("Where your money is.")).toBeVisible();
  const csv = await (await page.request.get("/seller/money/statement.csv")).text();
  expect(csv).toContain("BM-2611-0402");
  expect(csv).not.toContain("BM-2611-0350");

  await page.getByRole("button", { name: "Leave seller view" }).click();
  await expect(page).toHaveURL(/\/market$/);
});
