import { expect, type Page, test } from "@playwright/test";

// Khuyến mại (bước 43) và Vận chuyển (bước 44) dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-015). Kho
// mẫu nằm trong tiến trình máy chủ của giao diện, nên các bước nối nhau trong cùng một test.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");
/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

test("khuyến mại: thử giỏ nêu vì sao áp / không áp, bật bị chặn vì vượt trần, sửa giá rồi bật", async ({
  page,
}) => {
  await signIn(page, "/marketing/promotions");
  await expect(page.getByRole("heading", { level: 1, name: "Promotions" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 43")).toBeVisible();
  // Khuyến mại đứng đầu nhóm Tiếp thị.
  const sub = page.getByRole("navigation", { name: "Marketing", exact: true });
  await expect(sub.getByRole("link").first()).toHaveText("Promotions");

  // Thử giỏ: dòng lạ báo dưới ô; giỏ đúng nêu khoản giảm, quà và chương trình không áp.
  await page.getByLabel("Lines (SKU × quantity)").fill("CG26 × 1, NOPE");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("No variant with SKU “NOPE”.")).toBeVisible();
  await page.getByLabel("Lines (SKU × quantity)").fill("CG26 × 1, KB4-XA × 2");
  await page.getByRole("button", { name: "Calculate" }).click();
  const result = page.locator(".pm-result");
  await expect(result).toContainText("−69,000 ₫ · 10% off");
  await expect(result).toContainText("Gift: NRC750");
  await expect(result).toContainText("orders from 1,000,000 ₫; add 181,000 ₫ more.");

  // Tạo bản nháp: mọi lỗi báo một lần, dưới đúng ô.
  await page.getByRole("button", { name: "New program" }).click();
  await dialog(page).getByLabel("Discount", { exact: true }).fill("150%");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await expect(
    dialog(page).getByText("Enter a percentage from 0.01 to 100, for example 10%."),
  ).toBeVisible();
  await expect(dialog(page).getByLabel("Name shown to buyers")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog(page).getByLabel("Name shown to buyers").fill("5% off boards");
  await dialog(page).getByLabel("Discount", { exact: true }).fill("5");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(toast(page)).toContainText("Draft created");

  // Tạm dừng có Hoàn tác.
  await page.getByRole("link", { name: "10% off cast iron pans" }).click();
  await expect(page.locator(".cat-detail")).toContainText("690,000 ₫ → 621,000 ₫");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(toast(page)).toContainText("Paused");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");

  // Flash sale: bật bị chặn vì vượt trần; sửa về giá thấp nhất; ghi số tiếp nhận; bật được.
  await page.goto("/marketing/promotions/flash");
  await page.getByRole("button", { name: "Switch on", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Check and switch on" }).click();
  await expect(dialog(page).locator(".falert")).toHaveAttribute(
    "data-code",
    "promotions.exceeds_legal_limit",
  );
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Set to 345,000 ₫" }).click();
  await dialog(page).getByLabel("Deal price (đồng)").fill("300000");
  await dialog(page).getByRole("button", { name: "Save deal price" }).click();
  await expect(
    dialog(page).getByText("Above the legal cap: 345000 đồng at the lowest."),
  ).toBeVisible();
  await dialog(page).getByLabel("Deal price (đồng)").fill("345000");
  await dialog(page).getByRole("button", { name: "Save deal price" }).click();
  await expect(toast(page)).toContainText("Deal price changed");

  await page.goto("/marketing/promotions/notice");
  await page
    .getByRole("row", { name: /Weekend flash sale/ })
    .getByRole("button", { name: "Record receipt number" })
    .click();
  await dialog(page).getByLabel("Receipt number").fill("TB-KM-9/2026 (sample)");
  await dialog(page).getByRole("button", { name: "Record" }).click();
  await expect(toast(page)).toContainText("Submission recorded");

  await page.goto("/marketing/promotions/flash");
  await page.getByRole("button", { name: "Switch on", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Check and switch on" }).click();
  await expect(toast(page)).toContainText("Program switched on");

  // Lịch sử phiên bản có phiên bản 1 của flash sale.
  await page.goto("/marketing/promotions/versions");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Weekend flash sale" })
      .filter({ hasText: "Version 1" }),
  ).toBeVisible();
});

test("vận chuyển: đặt hãng, vận đơn tay báo lỗi theo ô, khớp COD, bảng kê trùng, hoàn tác phương thức", async ({
  page,
}) => {
  await signIn(page, "/sales/shipping");
  await expect(page.getByRole("heading", { level: 1, name: "Shipping" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 44")).toBeVisible();

  await page
    .getByRole("row", { name: /BM-2611-0415/ })
    .first()
    .getByRole("button", { name: "Book carrier" })
    .click();
  await dialog(page).getByRole("button", { name: "Book" }).click();
  await expect(toast(page)).toContainText("Request sent to the carrier");

  await page.getByRole("button", { name: "New manual shipment" }).click();
  await dialog(page).getByLabel("Order number").fill("0420");
  await dialog(page).getByLabel("Phone number").fill("123");
  await dialog(page).getByRole("button", { name: "Create shipment" }).click();
  await expect(dialog(page).getByText("Order numbers look like BM-2611-0420.")).toBeVisible();
  await expect(dialog(page).getByText("10 digits starting with 0.", { exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Dòng lệch "hãng báo đã giao": hỏi lại hành trình rồi tự khớp.
  await page.goto("/sales/shipping/cod");
  await page
    .getByRole("row", { name: /GN-8812 4471/ })
    .getByRole("button", { name: "Ask for tracking and match" })
    .click();
  await dialog(page).getByRole("button", { name: "Ask and match" }).click();
  await expect(toast(page)).toContainText("Asked the carrier and updated");

  await page.getByRole("button", { name: "Import statement CSV" }).click();
  await dialog(page).getByLabel("Carrier's statement number").fill("GNSG-2026-W45");
  await dialog(page)
    .getByLabel("Or paste the CSV content")
    .fill("tracking_number,cod_amount,fee\nGN-8813 0102,1059000,40000");
  await dialog(page).getByRole("button", { name: "Import" }).click();
  await expect(
    dialog(page).getByText("Statement GNSG-2026-W45 was imported with different content."),
  ).toBeVisible();

  // Tắt phương thức có Hoàn tác; tính thử phí nêu ngày giao dự kiến và hãng lỗi.
  await page.goto("/sales/shipping/rates");
  // "Tắt" lặp lại trên mọi dòng nên nằm trong "⋯".
  await page
    .getByRole("row", { name: /same_day/ })
    .getByRole("button", { name: /^More actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Turn off" }).click();
  await expect(toast(page)).toContainText("Turned off");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  await page.getByRole("button", { name: "Calculate" }).click();
  const quote = page.locator(".pm-result");
  await expect(quote).toContainText("Add 310,000 ₫ for free delivery.");
  await expect(quote).toContainText("The carrier connection is failing");

  // Lịch giao: lịch tháng, giờ 24h, ngày dd/mm; bấm một ngày để đặt ngày nghỉ và đổi giờ chốt từ
  // ngày đó. Chọn ngày 15 của tháng sau tháng sau để không đụng ngày giao của test khác.
  await page.goto("/sales/shipping/calendar");
  await expect(
    page.getByRole("heading", { name: "Orders placed before 16:00 are picked up the same day" }),
  ).toBeVisible();
  await expect(page.locator(".sc-cal")).not.toContainText(/\d{1,2}:\d\d\s?[AP]M/);
  const months = page.getByRole("navigation", { name: "Change month" });
  const target = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  target.setUTCMonth(target.getUTCMonth() + 2);
  const month = target.toISOString().slice(0, 7);
  await months.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/month=/);
  await months.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${month}$`));
  const day = `${month}-15`;
  const label = `15/${month.slice(5)}/${month.slice(0, 4)}`;
  await page.locator(`.sc-cal a[href$="day=${day}"]`).click();
  await expect(page.getByRole("heading", { level: 3, name: new RegExp(label) })).toBeVisible();
  await page.getByRole("button", { name: "Mark as holiday" }).click();
  await expect(dialog(page).getByLabel("From")).toHaveValue(day);
  await dialog(page).getByLabel("Name").fill("Nghỉ thử e2e");
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page)).toContainText("Holiday added");
  await expect(
    page.getByRole("link", { name: new RegExp(`${label} · Holiday: Nghỉ thử e2e`) }),
  ).toBeVisible();
  // Giờ chốt chọn trong danh sách 24h, áp từ ngày đang chọn.
  await expect(page.getByText(`Applies to orders from`)).toContainText(label);
  await page.getByLabel("Daily cut-off time").selectOption("15:00");
  await page.getByRole("button", { name: "Save calendar" }).click();
  await expect(toast(page)).toContainText("Saved");
  await expect(
    page.getByRole("row").filter({ hasText: label }).filter({ hasText: "15:00" }),
  ).toContainText("Upcoming");
});
