import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

// Bộ công cụ bảng chung: chọn nhiều + thanh hàng loạt (gom lỗi từng dòng), menu "⋯" trên dòng (bàn
// phím, hộp thoại hiện cả khi menu đã đóng), sắp theo cột trên địa chỉ, phân trang có tổng. Bình
// luận đi qua core giả (`order` của core); Sản phẩm và Mã giảm giá là dữ liệu mẫu.

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

test("bình luận: sắp theo giờ gửi (order của core), menu ⋯ bằng bàn phím, duyệt hàng loạt và xoá hẳn", async ({
  page,
}) => {
  await signIn(page, "/marketing/comments");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Thớt bị nứt");

  // Sắp: mặc định mới trước; bấm tiêu đề cột thì đảo chiều, ghi trên địa chỉ, có aria-sort.
  const sent = page.getByRole("columnheader", { name: "Sent" });
  await expect(sent).toHaveAttribute("aria-sort", "descending");
  await sent.getByRole("link").click();
  await expect(page).toHaveURL(/sort=created&dir=asc/);
  await expect(page.getByRole("columnheader", { name: "Sent" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(rows(page).first()).toContainText("Mua dầu");

  // Menu ⋯: nút đầu (Duyệt) nằm trên dòng, còn lại trong menu. Bàn phím: ↓ mở và vào mục đầu, Esc
  // đóng và trả con trỏ về nút.
  const more = page.getByRole("button", { name: "More actions for Mua dầu lau thớt ở đâu?" });
  await more.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "More actions for Mua dầu lau thớt ở đâu?" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open",
    "Reject",
    "Spam",
    "Delete for good",
  ]);
  await expect(menu.getByRole("menuitem", { name: "Open" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Reject" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await menu.getByRole("menuitem", { name: "Reject" }).click();
  await expect(toast(page)).toContainText("Rejected.");
  await expect(rows(page)).toHaveCount(1);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");
  await expect(rows(page)).toHaveCount(2);

  // Mục mở hộp thoại: menu đóng mà hộp thoại vẫn hiện.
  await more.click();
  await menu.getByRole("menuitem", { name: "Delete for good" }).click();
  await expect(menu).toBeHidden();
  await expect(dialog(page)).toContainText("Delete this comment for good?");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Chọn cả trang → Spam hàng loạt: core chỉ có lệnh từng cái, thanh báo "Done 2/2".
  const all = page.getByRole("checkbox", { name: "Select every row on this page" });
  await page.getByRole("checkbox", { name: "Select Mua dầu lau thớt ở đâu?" }).check();
  await expect(all).toHaveJSProperty("indeterminate", true);
  await expect(bar(page)).toContainText("1 selected");
  await all.check();
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Spam" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText("Nothing is waiting.", { exact: false })).toBeVisible();

  // Xoá hẳn hàng loạt cần hỏi lại; nút an toàn nhận con trỏ.
  await page.goto("/marketing/comments?status=spam");
  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog(page)).toContainText("Delete the selected comments for good?");
  await expect(dialog(page)).toContainText("Applies to 2 rows.");
  await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page)).toHaveCount(0);
});

test("sản phẩm: lỗi từng dòng gom lại, dòng hỏng vẫn được chọn; sắp theo tên; ⋯ ngừng bán có Hoàn tác", async ({
  page,
}) => {
  await signIn(page, "/catalog?status=blocked");
  const all = page.getByRole("checkbox", { name: "Select every row on this page" });
  await all.check();
  const count = await rows(page).count();
  await bar(page).getByRole("button", { name: "Put on sale" }).click();
  await expect(toast(page)).toContainText(`Done 0/${count}, ${count} error`);
  await expect(bar(page).getByRole("alert")).toContainText("Not done:");
  // Dòng chưa làm được vẫn được chọn để sửa rồi làm lại.
  await expect(bar(page)).toContainText(`${count} selected`);
  await bar(page).getByRole("button", { name: "Clear selection" }).click();
  await expect(bar(page)).toHaveCount(0);

  // Sắp theo tên, giữ bộ lọc; phân trang có tổng.
  await page.goto("/catalog");
  await page.getByRole("columnheader", { name: "Product" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/catalog\?sort=name&dir=asc$/);
  await expect(page.getByRole("columnheader", { name: "Product" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  const names = await page.locator("tbody td.rt-title a.open").allTextContents();
  expect(names).toEqual(
    [...names].sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base", numeric: true })),
  );
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/^1–\d+ of \d+/);

  // ⋯ trên một sản phẩm đang bán: Ngừng bán, rồi Hoàn tác.
  await page.goto("/catalog?status=active");
  await rows(page)
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Stop selling" }).click();
  await expect(toast(page)).toContainText("Not on sale");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");

  // Nhà cung cấp: sắp theo mã; dòng hiện một nút phụ, ngừng giao dịch trong ⋯; hàng loạt dùng lại.
  await page.goto("/catalog/inventory/suppliers");
  await page.getByRole("columnheader", { name: "Code" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=code&dir=asc/);
  const codes = await page.locator("tbody td.mono").allTextContents();
  expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })));
  const row = rows(page).first();
  await row.getByRole("button", { name: /^More actions for / }).click();
  await page.getByRole("menuitem", { name: "Stop using" }).click();
  await expect(toast(page)).toContainText("Supplier no longer used");
  await row.getByRole("checkbox").check();
  await bar(page).getByRole("button", { name: "Use again" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
});

test("mã giảm giá: vô hiệu hàng loạt có hỏi lại, xuất CSV đúng các mã đã chọn; điện thoại vẫn chọn được", async ({
  page,
}) => {
  await signIn(page, "/marketing/promotions/codes?q=KHSI&sort=code&dir=asc");
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/1–25 of \d+/);
  const first = (await page.locator("tbody td.rt-title a.open").allTextContents()).slice(0, 2);
  for (const code of first) {
    await page.getByRole("checkbox", { name: `Select ${code}` }).check();
  }
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bar(page).getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const csv = await readFile((await download.path()) ?? "", "utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(3);
  for (const code of first) expect(csv).toContain(code);

  await bar(page).getByRole("button", { name: "Disable" }).click();
  await expect(dialog(page)).toContainText("Disable the selected codes?");
  await dialog(page).getByRole("button", { name: "Disable" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await page.getByRole("link", { name: /^Disabled/ }).click();
  for (const code of first) await expect(page.getByRole("link", { name: code })).toBeVisible();

  // Điện thoại: bảng thành thẻ, ô chọn và ⋯ vẫn bấm được (vùng bấm 44px).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/marketing/promotions/codes?q=KHSI");
  const box = page.getByRole("checkbox", { name: /^Select KHSI/ }).first();
  await box.check();
  await expect(bar(page)).toContainText("1 selected");
  const more = rows(page)
    .first()
    .getByRole("button", { name: /^More actions for / });
  const size = await more.boundingBox();
  expect(size && size.height >= 44 && size.width >= 44).toBe(true);
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Copy code" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
