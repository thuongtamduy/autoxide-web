import { expect, type Page, test } from "@playwright/test";

// Bộ công cụ bảng trên các màn Bán hàng (dữ liệu mẫu, W-006): chọn nhiều + thanh hàng loạt (lặp lệnh
// từng cái, gom lỗi, Hoàn tác), menu "⋯" trên dòng (dòng hiện tối đa một nút phụ), sắp theo cột, phân
// trang có tổng. Kho mẫu nằm trong tiến trình máy chủ của giao diện và các spec khác cũng sửa nó, nên
// test chỉ dựa vào điều luôn đúng (vd số "Xong a/b" khớp số dòng đã chọn), không vào số cố định.

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
const selectPage = (page: Page) =>
  page.getByRole("checkbox", { name: "Select every row on this page" });

test("đơn hàng: đổi trả duyệt hàng loạt có hỏi lại, ⋯ chứa bước còn lại; giỏ bỏ dở nhắc một lần, gom lỗi, sắp theo giá trị", async ({
  page,
}) => {
  await signIn(page, "/sales/orders/returns?status=requested");
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/^1–\d+ of \d+/);
  // Dòng chờ quyết định: một nút trên dòng, "Từ chối" trong ⋯ cùng "Mở đơn".
  const first = rows(page).first();
  await first.getByRole("button", { name: /^More actions for / }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Reject with reason" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open order" })).toBeVisible();
  await page.keyboard.press("Escape");

  const count = await rows(page).count();
  await selectPage(page).check();
  await bar(page).getByRole("button", { name: "Approve" }).click();
  await expect(dialog(page)).toContainText("Approve the selected return requests?");
  await expect(dialog(page)).toContainText(`Applies to ${count} row`);
  await dialog(page).getByRole("button", { name: "Approve" }).click();
  // Yêu cầu trả tại quầy không qua bước duyệt (đi thẳng tới nhận hàng): báo lỗi riêng dòng.
  await expect(toast(page)).toContainText(new RegExp(`Done \\d+/${count}`));

  // Giỏ bỏ dở: chọn cả trang để nhắc một lần; giỏ không nhắc được báo lỗi riêng, vẫn được chọn.
  await page.goto("/sales/orders/carts");
  const carts = await rows(page).count();
  const blocked = await rows(page).filter({ hasText: "Cannot remind" }).count();
  expect(blocked).toBeGreaterThan(0);
  await selectPage(page).check();
  await bar(page).getByRole("button", { name: "Send reminder" }).click();
  await expect(toast(page)).toContainText(new RegExp(`^Done \\d+/${carts}, \\d+ errors?`));
  await expect(bar(page).getByRole("alert")).toContainText("Not done:");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText(/^Done \d+\/\d+$/);
  await bar(page).getByRole("button", { name: "Clear selection" }).click();

  await page.getByRole("columnheader", { name: "Value" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/sales\/orders\/carts\?sort=value&dir=desc$/);
  await expect(page.getByRole("columnheader", { name: "Value" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
});

test("vận chuyển: đặt hãng hàng loạt gom lỗi từng vận đơn, hỏi lại hành trình hàng loạt, hãng và phí giao chỉ còn ⋯ trên dòng, bật / tắt hàng loạt có Hoàn tác, COD đóng dòng lệch cần lý do", async ({
  page,
}) => {
  // Vận đơn đang đi: dòng chỉ có nút "Hỏi lại hành trình"; đặt hãng hàng loạt báo lỗi từng vận đơn
  // (không ở trạng thái chờ đặt) và giữ chúng được chọn; hỏi lại hành trình hàng loạt thì xong hết.
  await signIn(page, "/sales/shipping?status=in_transit");
  const moving = await rows(page).count();
  expect(moving).toBeGreaterThan(0);
  await expect(
    rows(page)
      .first()
      .getByRole("button", { name: /^Ask for tracking / }),
  ).toBeVisible();
  await selectPage(page).check();
  await bar(page).getByRole("button", { name: "Book carrier" }).click();
  await expect(dialog(page)).toContainText("Book the selected shipments with their carriers?");
  await dialog(page).getByRole("button", { name: "Book" }).click();
  await expect(toast(page)).toContainText(`Done 0/${moving}, ${moving} error`);
  await expect(bar(page).getByRole("alert")).toContainText("Not done:");
  await expect(bar(page)).toContainText(`${moving} selected`);
  await bar(page).getByRole("button", { name: "Ask for tracking" }).click();
  await expect(toast(page)).toContainText(`Done ${moving}/${moving}`);

  // Hãng: thao tác nằm trong ⋯ (kiểm tra kết nối, thay khoá, tắt có Hoàn tác).
  await page.goto("/sales/shipping/carriers");
  const carrier = rows(page).first();
  await carrier.getByRole("button", { name: /^More actions for / }).click();
  await expect(page.getByRole("menuitem", { name: "Show details" })).toBeVisible();
  await page.getByRole("menuitem", { name: /^Turn carrier (off|on)$/ }).click();
  await expect(toast(page)).toContainText(/Turned (off|on)/);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");

  // Phí giao: chọn hai phương thức, tắt hàng loạt rồi Hoàn tác.
  await page.goto("/sales/shipping/rates");
  const methods = page.locator("section[aria-labelledby=methods-h] tbody tr");
  await methods.nth(0).getByRole("checkbox").check();
  await methods.nth(1).getByRole("checkbox").check();
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Turn off" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText(/^Done \d\/\d$/);

  // COD: chọn dòng lệch, "Đóng kèm lý do" hỏi lại và bắt buộc lý do.
  await page.goto("/sales/shipping/cod");
  const lines = page.locator("section[aria-labelledby=mismatch-h] tbody tr");
  const open = await lines.count();
  // Chỉ kiểm hộp hỏi lại (lý do bắt buộc) rồi huỷ: dữ liệu mẫu dùng chung chỉ có vài dòng COD lệch, spec
  // vận chuyển đã đóng một dòng, còn Việc cần làm (work.spec) cần dòng lệch còn mở.
  await lines.first().getByRole("checkbox").check();
  await bar(page).getByRole("button", { name: "Close with a reason" }).click();
  await expect(dialog(page)).toContainText("Close the selected mismatches with one reason?");
  await dialog(page).locator("button[type=submit]").click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(lines).toHaveCount(open);
});

test("cửa hàng: nhận tại cửa hàng báo sẵn sàng hàng loạt; ca mặc định ca cần xem, cột Lệch sắp được, Đóng ca trên dòng; đánh giá đánh dấu đã xem hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/sales/stores");
  const preparing = rows(page).filter({ has: page.getByRole("button", { name: "Mark ready" }) });
  const ready = await preparing.count();
  expect(ready).toBeGreaterThan(0);
  for (let i = 0; i < ready; i += 1) await preparing.nth(i).getByRole("checkbox").check();
  await bar(page).getByRole("button", { name: "Mark ready" }).click();
  await expect(toast(page)).toContainText(`Done ${ready}/${ready}`);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText(`Done ${ready}/${ready}`);
  await expect(preparing).toHaveCount(ready);
  // ⋯ của đơn đã sẵn sàng: gửi lại mã, huỷ; nút bàn giao nằm trên dòng.
  const handed = rows(page).filter({ has: page.getByRole("button", { name: "Hand over" }) });
  await handed
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await expect(page.getByRole("menuitem", { name: "Resend pickup code" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Cancel and release" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Ca: mặc định "Cần xem" (ca mở + ca lệch); không có ca đã đóng mà khớp tiền.
  await page.goto("/sales/stores/shifts");
  await expect(page.getByRole("link", { name: /^Needs a look/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rows(page).filter({ hasNotText: /Open|Closed · difference/ })).toHaveCount(0);
  const open = rows(page).filter({ hasText: "Open" });
  await expect(open.first().getByRole("button", { name: "Close shift" })).toBeVisible();
  await page.getByRole("columnheader", { name: "Difference" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=difference&dir=asc/);
  await expect(page.getByRole("columnheader", { name: "Difference" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/^1–\d+ of \d+/);
  await page.getByRole("link", { name: /^All\s+\d+$/ }).click();
  await expect(page).toHaveURL(/chip=all/);

  // Đánh giá mới: chọn cả trang → Đánh dấu đã xem; chip "Mới" về rỗng.
  await page.goto("/sales/stores/reviews?chip=new");
  const fresh = await rows(page).count();
  await selectPage(page).check();
  await bar(page).getByRole("button", { name: "Mark as seen" }).click();
  await expect(toast(page)).toContainText(`Done ${fresh}/${fresh}`);
  await expect(page.getByText("No reviews match.")).toBeVisible();
});

test("kênh bán: tạm dừng hàng loạt gom lỗi; 'Cần xử lý' lọc thật, 'Tất cả' có đơn đã nhập; đối soát đóng nhiều dòng lệch", async ({
  page,
}) => {
  await signIn(page, "/sales/channels");
  const accounts = page.locator("section[aria-labelledby=ch-accounts-h] tbody tr");
  const total = await accounts.count();
  const running = await accounts.filter({ hasText: "Running" }).count();
  await page
    .locator("section[aria-labelledby=ch-accounts-h]")
    .getByRole("checkbox", { name: "Select every row on this page" })
    .check();
  await bar(page).getByRole("button", { name: "Pause" }).click();
  await expect(toast(page)).toContainText(
    running === total ? `Done ${running}/${total}` : `Done ${running}/${total}, `,
  );
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText(`Done ${running}/${running}`);
  await expect(accounts.filter({ hasText: "Running" })).toHaveCount(running);

  // Đơn cần xử lý: chip mặc định không có đơn đã nhập; "Tất cả" có.
  await page.goto("/sales/channels/inbound");
  await expect(page.getByRole("link", { name: /^To handle first/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const imported = page.getByRole("cell", { name: "Imported", exact: true });
  await expect(imported).toHaveCount(0);
  await page.getByRole("link", { name: /^All\s+\d+$/ }).click();
  await expect(page).toHaveURL(/chip=all/);
  await expect(imported.first()).toBeVisible();

  // Đối soát: đóng mọi dòng lệch với cùng một ghi chú.
  await page.goto("/sales/channels/settlements");
  const lines = page.locator("section[aria-labelledby=mismatch-h] tbody tr");
  const mismatched = await lines.filter({ hasText: "Mismatch" }).count();
  if (mismatched > 0) {
    await page
      .locator("section[aria-labelledby=mismatch-h]")
      .getByRole("checkbox", { name: "Select every row on this page" })
      .check();
    await bar(page).getByRole("button", { name: "Mark resolved" }).click();
    await dialog(page).getByLabel("Note").fill("Đã đối chiếu với kênh");
    await dialog(page).getByRole("button", { name: "Mark resolved" }).click();
    await expect(toast(page)).toContainText(`Done ${mismatched}/${mismatched}`);
  }
  await expect(lines.filter({ hasText: "Mismatch" })).toHaveCount(0);
});
