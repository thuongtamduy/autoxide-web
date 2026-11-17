import { expect, type Page, test } from "@playwright/test";

// Đơn hàng và Cửa hàng (bước 45) dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-017). Kho mẫu nằm trong tiến
// trình máy chủ của giao diện, nên các bước nối nhau trong cùng một test.

const CORE = "http://127.0.0.1:4010";

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");

test("đơn hàng: số đếm khớp, view, hỏi bằng lời, xác nhận hàng loạt có Hoàn tác, hoàn tiền qua hộp xác nhận", async ({
  page,
}) => {
  await signIn(page, "/sales/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page.getByText("412 orders in the last 30 days · 37 pending")).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 45").first()).toBeVisible();
  // Đơn hàng đứng đầu nhóm Bán hàng, rồi Vận chuyển, Cửa hàng, Kênh bán (W-019).
  const sub = page.getByRole("navigation", { name: "Sales", exact: true });
  // Màn có việc đang chờ mang số đếm cạnh tên (W-020).
  await expect(sub.getByRole("link")).toHaveText([
    /^Orders\s*\d*$/,
    /^Shipping\s*\d*$/,
    "Stores",
    "Sales channels",
  ]);

  // View "Chờ xử lý": số trên chip bằng số đơn khớp.
  await page.getByRole("link", { name: /^Pending\s+37$/ }).click();
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText("1–25 of 37");

  // Hỏi bằng lời: tắt khi core chưa bật AI; bật thì câu thành chip sửa được, Áp dụng mới lọc.
  await expect(page.getByLabel("Describe the orders you want")).toBeDisabled();
  expect((await page.request.post(`${CORE}/__ai`, { data: { enabled: true } })).status()).toBe(204);
  await page.goto("/sales/orders");
  await page
    .getByLabel("Describe the orders you want")
    .fill("COD orders at district 3 not delivered yet, blue");
  await page.getByRole("button", { name: "Understand" }).click();
  await expect(page.getByText("Not understood: «blue»")).toBeVisible();
  await page.getByRole("button", { name: "Remove Selling node" }).click();
  await page.getByRole("button", { name: /^Apply · \d+ orders?$/ }).click();
  await expect(page).toHaveURL(
    /status=confirmed%2Cpreparing%2Cshipping%2Cdelivery_failed&flow=cod$/,
  );
  await expect(page.getByRole("link", { name: /COD chưa giao/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.request.post(`${CORE}/__ai`, { data: { enabled: false } });

  // Xác nhận hàng loạt, rồi Hoàn tác.
  await page.goto("/sales/orders?status=awaiting_acceptance");
  const boxes = page.getByRole("checkbox", { name: /^Select BM-/ });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(toast(page)).toContainText("Accepted 2 orders; 0 in another status skipped");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Back to awaiting acceptance: 2");

  // Đề xuất hoàn tiền của agent: hộp xác nhận nêu số tiền và nơi tiền về, nút Huỷ nhận con trỏ.
  await page.goto("/sales/orders?q=0409");
  await page.getByRole("link", { name: "BM-2611-0409" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "BM-2611-0409" })).toBeVisible();
  await page.getByRole("button", { name: "Approve refund" }).click();
  await expect(dialog(page)).toContainText("Goes to");
  await expect(dialog(page)).toContainText("This cannot be undone.");
  await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Approve refund of 690,000 ₫" }).click();
  await expect(toast(page)).toContainText("Refunded 690,000 ₫ for BM-2611-0409");

  // Hoàn một phần: số vượt phần còn lại báo dưới ô; bước xác nhận nêu số tiền.
  await page.goto("/sales/orders?q=0398");
  await page.getByRole("link", { name: "BM-2611-0398" }).click();
  await page.getByRole("button", { name: "Refund" }).click();
  await dialog(page).getByLabel("Amount (đồng)").fill("500000");
  await dialog(page).getByRole("button", { name: "Review" }).click();
  await expect(dialog(page).getByText("At most 389,000 ₫ can still be refunded.")).toBeVisible();
  await dialog(page).getByLabel("Amount (đồng)").fill("100000");
  await dialog(page).getByLabel("Reason").fill("Hộp móp");
  await dialog(page).getByRole("button", { name: "Review" }).click();
  await expect(dialog(page)).toContainText("the buyer's bank account");
  await dialog(page).getByRole("button", { name: "Refund 100,000 ₫" }).click();
  await expect(toast(page)).toContainText("Refunded 100,000 ₫ for BM-2611-0398");

  // Nhận đơn của sàn rồi Hoàn tác.
  await page.goto("/sales/orders?q=0413");
  await page.getByRole("link", { name: "BM-2611-0413" }).click();
  await page.getByRole("button", { name: "Accept order" }).click();
  await expect(toast(page)).toContainText("Order accepted");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
});

test("đổi trả, bán tại quầy, giỏ bỏ dở; cửa hàng: bàn giao cần đúng mã, đóng ca lệch cần lý do", async ({
  page,
}) => {
  await signIn(page, "/sales/orders/returns");
  // Bước kế tiếp hiện trên dòng, các bước còn lại (từ chối) trong "⋯".
  await page.getByRole("button", { name: "More actions for TH-2611-0022" }).click();
  await page.getByRole("menuitem", { name: "Reject with reason" }).click();
  await dialog(page).getByRole("button", { name: "Reject" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Bán tại quầy: tạo đơn rồi mở bản xem trước hoá đơn.
  // Quầy: chạm sản phẩm, mã sai nêu lý do (máy chủ xét), tiền khách đưa thiếu chặn thanh toán.
  await page.goto("/sales/orders/pos");
  await page.getByRole("button", { name: /^Add Blue glaze ceramic bowls \(set of 6\)/ }).click();
  await expect(page.getByLabel("Quantity of Blue glaze ceramic bowls (set of 6)")).toHaveText("1");
  await page.getByLabel("Discount code").fill("khongco");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".pos-codes li.bad")).toContainText("KHONGCO");
  await page.getByLabel("Cash received").fill("100000");
  await expect(page.getByRole("button", { name: /^Charge/ })).toBeDisabled();
  await page.getByRole("button", { name: "Exact" }).click();
  await expect(page.locator(".pos-change b")).toHaveText(/^0\s?₫|₫\s?0$/);
  await page.keyboard.press("F9");
  await expect(page).toHaveURL(/\/receipt\?new=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Invoice preview" })).toBeVisible();
  await expect(
    page.getByText(/Order BM-2611-\d{4} created at CN Quận 3; stock deducted\./),
  ).toBeVisible();

  await page.goto("/sales/orders/carts");
  await page.getByRole("button", { name: "Send reminder" }).first().click();
  await expect(toast(page)).toContainText("scheduled");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Reminder cancelled");

  // Cửa hàng: mã nhận sai báo dưới ô; nhân viên không thấy mã.
  await page.goto("/sales/stores");
  await expect(page.getByRole("heading", { level: 1, name: "Store operations" })).toBeVisible();
  await page
    .getByRole("row", { name: /BM-2611-0406/ })
    .first()
    .getByRole("button", { name: "Hand over" })
    .click();
  await dialog(page).getByLabel("6-digit pickup code").fill("123456");
  await dialog(page).getByRole("button", { name: "Hand over" }).click();
  await expect(
    dialog(page).getByText("The code does not match. Ask the buyer to read it again."),
  ).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await page.goto("/sales/stores/shifts?chip=open");
  await page
    .getByRole("row", { name: /CN Cầu Giấy · Quầy 1/ })
    .first()
    .getByRole("button", { name: "Close shift" })
    .click();
  await dialog(page).getByLabel("Cash counted (đồng)").fill("1");
  await dialog(page).getByRole("button", { name: "Close shift" }).click();
  await expect(dialog(page).getByText(/The count differs by -1499999 đồng/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Đánh giá: ẩn cần lý do trong danh sách và ghi chú.
  await page.goto("/sales/stores/reviews?chip=low");
  await page
    .getByRole("row", { name: /Chảo gang/ })
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Hide with reason" }).click();
  await dialog(page).getByRole("button", { name: "Hide" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
});
