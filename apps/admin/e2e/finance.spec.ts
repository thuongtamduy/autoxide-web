import { expect, type Page, test } from "@playwright/test";

// Phân hệ Tài chính: màn "Kế toán" dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-016), chờ module `tax`,
// `ledger`, `invoices` của core (bước 36). Kho mẫu nằm trong tiến trình máy chủ của giao diện, nên
// các bước nối nhau trong cùng một test.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");

test("sổ cái: bút toán tay kiểm Nợ = Có, rồi đảo một lần", async ({ page }) => {
  await signIn(page, "/finance");
  await expect(page.getByRole("heading", { level: 1, name: "Accounting" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 36").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Finance" }).first()).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Parts of Accounting" });
  await expect(tabs.getByRole("link", { name: /Exceptions queue/ })).toBeVisible();

  // Không cân: tổng hai bên hiện ngay khi gõ, core từ chối với mã ledger.unbalanced.
  await page.getByRole("button", { name: "Post manual entry" }).click();
  const form = dialog(page);
  await form.getByLabel("Description").fill("Bank transfer fees test");
  const line1 = form.getByRole("group", { name: "Line 1" });
  const line2 = form.getByRole("group", { name: "Line 2" });
  await line1.getByLabel("Account").selectOption({ label: "Gateway fee expense" });
  await line1.getByLabel("Debit").fill("44.000");
  await line2.getByLabel("Account").selectOption({ label: "Bank deposits" });
  await line2.getByLabel("Credit").fill("40000");
  await expect(form.getByText(/Off by 4,000/)).toBeVisible();
  await form.getByRole("button", { name: "Post entry" }).click();
  await expect(form.locator(".falert")).toHaveAttribute("data-code", "ledger.unbalanced");

  // Sửa cho cân thì ghi được; bút toán mới chờ niêm phong.
  await line2.getByLabel("Credit").fill("44000");
  await expect(form.getByText("Debits equal credits")).toBeVisible();
  await form.getByRole("button", { name: "Post entry" }).click();
  await expect(toast(page)).toContainText("Entry posted");
  const row = page.getByRole("row", { name: /Bank transfer fees test/ });
  await expect(row).toContainText("Awaiting seal");

  // Đảo: lý do quá ngắn báo dưới ô; đảo xong thì bút toán gốc thành "Reversed".
  await row.getByRole("link", { name: "Bank transfer fees test" }).click();
  await page.getByRole("button", { name: "Reverse entry" }).click();
  await dialog(page).getByLabel("Reason").fill("x");
  await dialog(page).getByRole("button", { name: "Reverse", exact: true }).click();
  await expect(dialog(page).getByText("Write 5 to 200 characters.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Wrong debit account");
  await dialog(page).getByRole("button", { name: "Reverse", exact: true }).click();
  await expect(toast(page)).toContainText("Reversal posted");
  await expect(page.getByRole("row", { name: /Bank transfer fees test BT-/ })).toContainText(
    "Reversed",
  );
});

test("hàng chờ sai lệch, hoá đơn bị trả lỗi, khoá sổ, tính thử thuế", async ({ page }) => {
  await signIn(page, "/finance/exceptions");
  await page.getByRole("link", { name: "Wrong amount", exact: true }).first().click();
  await page.getByRole("button", { name: "Resolve with reason" }).click();
  await dialog(page).getByLabel("Reason").fill("The buyer paid the rest");
  await dialog(page).getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(toast(page)).toContainText("Exception resolved");

  // Hoá đơn bị trả lỗi: MST sai báo dưới ô, đúng thì gửi lại cùng số.
  await page.goto("/finance/einvoices?f=rejected");
  await page.getByRole("link", { name: "00004124" }).click();
  await page.getByRole("button", { name: "Fix and resend with same number" }).click();
  await dialog(page).getByLabel("Buyer tax code").fill("123456789");
  await dialog(page).getByRole("button", { name: "Save and resend" }).click();
  await expect(
    dialog(page).getByText("The buyer tax code must have 10 or 13 digits (10-3 form)."),
  ).toBeVisible();
  await dialog(page).getByLabel("Buyer tax code").fill("0312345678");
  await dialog(page).getByRole("button", { name: "Save and resend" }).click();
  await expect(toast(page)).toContainText("same number");

  // Khoá sổ: phải gõ đúng tên kỳ; khoá rồi hiện "Closed".
  await page.goto("/finance/periods");
  await page.getByRole("link", { name: "Oct 2026" }).click();
  await page.getByRole("button", { name: "Close Oct 2026" }).click();
  await dialog(page).getByLabel("Type 10/2026 to confirm").fill("10-2026");
  await dialog(page).getByRole("button", { name: "Close period" }).click();
  await expect(dialog(page).getByText("Type 10/2026 exactly to confirm.")).toBeVisible();
  await dialog(page).getByLabel("Type 10/2026 to confirm").fill("10/2026");
  await dialog(page).getByRole("button", { name: "Close period" }).click();
  await expect(toast(page)).toContainText("Period Oct 2026 closed");
  // Dòng của kỳ (tên bắt đầu bằng tên kỳ); dòng chi tiết đang mở bên dưới cũng chứa "Oct 2026".
  await expect(page.getByRole("row", { name: /^Oct 2026/ })).toContainText("Closed");

  // Tính thử thuế: tách ngược, làm tròn một lần; kèm mức sau khi hết giảm.
  await page.goto("/finance/tax");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText(/690,000\s₫ includes 8% VAT: 638,889\s₫ before tax/)).toBeVisible();
  await expect(page.getByText(/\(10%\): 627,273\s₫ and 62,727\s₫/)).toBeVisible();
});

test("điện thoại: bảng thành thẻ có nhãn cột, không tràn ngang", async ({ page }) => {
  await signIn(page, "/finance/einvoices");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Accounting" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
