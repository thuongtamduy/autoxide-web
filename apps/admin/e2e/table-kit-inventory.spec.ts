import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

// Bộ công cụ bảng (W-058) áp cho Tồn kho và Khuyến mại: chọn nhiều + thanh hàng loạt (lặp lệnh từng
// phiếu, gom lỗi, dòng hỏng vẫn được chọn), menu "⋯" trên dòng, sắp theo cột, phân trang có tổng, lọc
// khoảng ngày của sổ biến động. Cả hai màn dựng bằng dữ liệu mẫu (W-006) trong tiến trình máy chủ của
// giao diện, nên test không dựa vào phiếu mà spec khác có thể đã đổi (CK-0220, chỗ tồn đã điều chỉnh).

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
const pages = (page: Page) => page.getByRole("navigation", { name: "Pages" });
/** Dòng của bảng chương trình (trang còn bảng trần pháp luật bên dưới). */
const programs = (page: Page) => page.locator("section[aria-labelledby=programs-h] tbody tr");

test("mức tồn: sắp theo sẵn bán, phân trang có tổng, ⋯ trên dòng, đặt mức tối thiểu hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/catalog/inventory");
  await expect(pages(page)).toContainText(/^1–\d+ of \d+/);

  const available = page.getByRole("columnheader", { name: "Available / minimum" });
  await available.getByRole("link").click();
  await expect(page).toHaveURL(/\/catalog\/inventory\?sort=available&dir=asc$/);
  await expect(available).toHaveAttribute("aria-sort", "ascending");
  const shown = (await page.locator("tbody td.text-right b").allTextContents()).map((text) =>
    Number(text.split("/")[0]?.trim().replace("−", "-").replaceAll(",", "")),
  );
  expect(shown).toEqual([...shown].sort((a, b) => a - b));

  // ⋯: xem, sổ của dòng, điều chỉnh, chuyển về, đổi mức — hộp thoại mở được từ menu.
  await rows(page)
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "View details",
    "Ledger of this row",
    "Adjust stock",
    "Transfer here",
    "Change minimum",
  ]);
  await page.getByRole("menuitem", { name: "Change minimum" }).click();
  await expect(dialog(page)).toContainText("Change the minimum stock");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Hàng loạt có ô nhập: trống thì báo, có số thì đặt cho từng dòng.
  await rows(page).nth(0).getByRole("checkbox").check();
  await rows(page).nth(1).getByRole("checkbox").check();
  await expect(bar(page)).toContainText("2 selected");
  await bar(page).getByRole("button", { name: "Set minimum" }).click();
  await dialog(page).getByRole("button", { name: "Set minimum" }).click();
  await expect(dialog(page)).toContainText("Fill in this field.");
  await dialog(page).getByLabel("New minimum").fill("7");
  await dialog(page).getByRole("button", { name: "Set minimum" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page).nth(0)).toContainText("/ 7");
});

test("chuyển kho: dòng hiện một nút phụ, gửi đi hàng loạt gom lỗi, sắp theo số phiếu", async ({
  page,
}) => {
  await signIn(page, "/catalog/inventory/transfers");
  const before = await rows(page).count();
  await page.getByRole("button", { name: "Create transfer" }).click();
  await dialog(page).getByLabel("From").selectOption({ label: "Kho Thủ Đức" });
  await dialog(page).getByLabel("To").selectOption({ label: "CN Quận 3" });
  await dialog(page).getByLabel("Lines (SKU × quantity)").fill("TG35 × 1");
  await dialog(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(toast(page)).toContainText("Transfer created (draft)");
  await expect(rows(page)).toHaveCount(before + 1);

  // Mặc định mới trước: phiếu nháp vừa tạo ở dòng đầu, có "Gửi đi" và ⋯ (xem, huỷ).
  const draft = rows(page).first();
  const number = (await draft.locator("a.open").textContent()) ?? "";
  await expect(draft.getByRole("button", { name: "Ship" })).toBeVisible();
  await draft.getByRole("button", { name: `More actions for ${number}` }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["View lines", "Cancel"]);
  await page.keyboard.press("Escape");

  // Phiếu đã nhận đủ không gửi đi được: "Xong 1/2, 1 lỗi", phiếu hỏng vẫn được chọn.
  await page.getByRole("checkbox", { name: `Select ${number}` }).check();
  await page.getByRole("checkbox", { name: "Select CK-0214" }).check();
  await bar(page).getByRole("button", { name: "Ship" }).click();
  await expect(dialog(page)).toContainText("Ship the selected transfers?");
  await expect(dialog(page)).toContainText("Applies to 2 rows.");
  await dialog(page).getByRole("button", { name: "Ship" }).click();
  await expect(toast(page)).toContainText("Done 1/2, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText("CK-0214:");
  await expect(bar(page)).toContainText("1 selected");
  await expect(page.getByRole("row", { name: new RegExp(number) })).toContainText("In transit");
  await bar(page).getByRole("button", { name: "Clear selection" }).click();

  await page.getByRole("columnheader", { name: "Transfer" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=number&dir=asc/);
  const numbers = await page.locator("tbody td.rt-title a.open").allTextContents();
  expect(numbers).toEqual([...numbers].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })));
  await expect(pages(page)).toContainText(/^1–\d+ of \d+/);
});

test("kiểm kê, lô, nhập hàng: áp dụng / loại bỏ / đặt hàng hàng loạt báo đúng phiếu hỏng", async ({
  page,
}) => {
  // Kiểm kê: KK-0031 còn dòng lệch thiếu lý do nên không áp dụng được.
  await signIn(page, "/catalog/inventory/counts");
  await page.getByRole("button", { name: "More actions for KK-0032" }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Open count",
    "Apply differences",
    "Cancel count",
  ]);
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "Select KK-0031" }).check();
  await bar(page).getByRole("button", { name: "Apply differences" }).click();
  await expect(dialog(page)).toContainText("Apply the selected counts?");
  await dialog(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(toast(page)).toContainText("Done 0/1, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText("KK-0031:");

  // Lô: sắp theo số còn; lô đã hết không loại bỏ được, lô còn hàng thì được.
  await page.goto("/catalog/inventory/lots");
  const left = page.getByRole("columnheader", { name: "Left" });
  await left.getByRole("link").click();
  await expect(page).toHaveURL(/sort=left&dir=desc/);
  await expect(left).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("checkbox", { name: "Select NRC-2608" }).check();
  await page.getByRole("checkbox", { name: "Select MT-2610" }).check();
  await bar(page).getByRole("button", { name: "Write off early" }).click();
  await expect(dialog(page)).toContainText("Write off the selected lots?");
  await dialog(page).getByRole("button", { name: "Write off" }).click();
  await expect(toast(page)).toContainText("Done 1/2, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText("NRC-2608:");
  await bar(page).getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "More actions for MT-2610" }).click();
  await page.getByRole("menuitem", { name: "Ledger of this row" }).click();
  await expect(page).toHaveURL(/\/catalog\/inventory\/moves\?level=/);
  await expect(rows(page).first()).toContainText("Expired");

  // Nhập hàng: đơn nháp đặt được, đơn đã nhận đủ thì không; dòng nháp hiện "Đặt hàng", huỷ trong ⋯.
  await page.goto("/catalog/inventory/purchasing");
  const po = page.getByRole("row", { name: /PO-0088/ });
  await expect(po.getByRole("button", { name: "Place order PO-0088" })).toBeVisible();
  await po.getByRole("button", { name: "More actions for PO-0088" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["View lines", "Cancel"]);
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "Select PO-0088" }).check();
  await page.getByRole("checkbox", { name: "Select PO-0086" }).check();
  await bar(page).getByRole("button", { name: "Place order" }).click();
  await expect(dialog(page)).toContainText("Place the selected orders?");
  await dialog(page).getByRole("button", { name: "Place order" }).click();
  await expect(toast(page)).toContainText("Done 1/2, 1 error");
  await expect(page.getByRole("row", { name: /PO-0088/ })).toContainText("Ordered");
  await page.getByRole("columnheader", { name: "Total (excl. VAT)" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=total&dir=desc/);
});

test("sổ biến động: sắp theo thời gian, lọc khoảng ngày, phân trang có tổng", async ({ page }) => {
  await signIn(page, "/catalog/inventory/moves");
  const when = page.getByRole("columnheader", { name: "When" });
  await expect(when).toHaveAttribute("aria-sort", "descending");
  await expect(pages(page)).toContainText(/^1–\d+ of \d+/);
  await when.getByRole("link").click();
  await expect(page).toHaveURL(/sort=at&dir=asc/);
  await expect(page.getByRole("columnheader", { name: "When" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  // Dòng cũ nhất lên đầu: số dư đầu kỳ.
  await expect(rows(page).first()).toContainText("Opening balance");

  // Khoảng ngày không có biến động nào: bảng rỗng, phân trang báo không có dòng; giữ cách sắp.
  await page.getByLabel("From (Vietnam time)").fill("2000-01-01");
  await expect(page).toHaveURL(/from=2000-01-01/);
  await page.getByLabel("To", { exact: true }).fill("2000-01-02");
  await expect(page).toHaveURL(/to=2000-01-02/);
  await expect(page).toHaveURL(/sort=at&dir=asc/);
  await expect(page.getByText("No movements match.")).toBeVisible();
  await expect(pages(page)).toContainText("No rows");
  await page.getByRole("link", { name: "Clear dates" }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(pages(page)).toContainText(/^1–\d+ of \d+/);

  // ⋯: xem chi tiết dòng sổ.
  await rows(page)
    .first()
    .getByRole("button", { name: /^More actions for / })
    .click();
  await page.getByRole("menuitem", { name: "View details" }).click();
  await expect(page.locator(".cat-detail")).toContainText("A ledger row is never edited");
});

test("chương trình khuyến mại: tạm dừng hàng loạt có Hoàn tác, bản nháp báo lỗi, xuất CSV, ⋯ trên dòng", async ({
  page,
}) => {
  await signIn(page, "/marketing/promotions?status=active");
  const running = await programs(page).count();
  expect(running).toBeGreaterThan(0);
  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Pause" }).click();
  await expect(toast(page)).toContainText(`Done ${running}/${running}`);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText(`Done ${running}/${running}`);
  await expect(programs(page)).toHaveCount(running);

  // ⋯ của chương trình đang chạy: tạm dừng có Hoàn tác.
  const pans = page.getByRole("button", { name: "More actions for 10% off cast iron pans" });
  await pans.click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "View details",
    "Pause",
    "Extend",
    "End early",
  ]);
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(toast(page)).toContainText("Paused");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");

  // Xuất CSV đúng chương trình đã chọn.
  await page.getByRole("checkbox", { name: "Select 10% off cast iron pans" }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bar(page).getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const csv = await readFile((await download.path()) ?? "", "utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
  expect(csv).toContain("10% off cast iron pans");
  await bar(page).getByRole("button", { name: "Clear selection" }).click();

  // Bản nháp không tạm dừng được: mỗi cái báo lỗi riêng.
  await page.goto("/marketing/promotions?status=draft");
  const drafts = await programs(page).count();
  await page.getByRole("checkbox", { name: "Select every row on this page" }).check();
  await bar(page).getByRole("button", { name: "Pause" }).click();
  await expect(toast(page)).toContainText(`Done 0/${drafts}, ${drafts} error`);

  // Sắp theo tên, giữ bộ lọc; phân trang có tổng.
  await page.goto("/marketing/promotions");
  await page.getByRole("columnheader", { name: "Program" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/marketing\/promotions\?sort=title&dir=asc$/);
  const titles = await page.locator("tbody td.rt-title a.open").allTextContents();
  expect(titles).toEqual(
    [...titles].sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base", numeric: true })),
  );
  await expect(pages(page)).toContainText(/^1–\d+ of \d+/);
});
