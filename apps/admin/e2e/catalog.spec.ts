import { expect, type Page, test } from "@playwright/test";

// Phân hệ Sản phẩm: "Sản phẩm và giá" và "Tồn kho" dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-013),
// chờ module `catalog` / `inventory` của core (bước 41, 42). Kho mẫu nằm trong tiến trình máy chủ
// của giao diện, nên các bước nối nhau trong cùng một test.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");

test("sản phẩm: tìm không dấu, tạo bản nháp (SKU trùng báo dưới ô), mở bán bị từ chối khi thiếu điều kiện", async ({
  page,
}) => {
  await signIn(page, "/catalog");
  await expect(page.getByRole("heading", { level: 1, name: "Products and prices" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 41")).toBeVisible();
  const sub = page.getByRole("navigation", { name: "Products", exact: true });
  await expect(sub.getByRole("link", { name: "Products and prices" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(sub.getByRole("link", { name: "Inventory" })).toBeVisible();

  // Tìm không dấu.
  await page.getByRole("searchbox", { name: "Search" }).fill("chao gang");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("link", { name: "Cast iron pan", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Round wooden board 30 cm" })).toHaveCount(0);
  await expect(page.getByText("590,000 ₫ – 760,000 ₫")).toBeVisible();

  // Tạo bản nháp: SKU trùng báo dưới ô, giá trị đã gõ còn nguyên.
  await page.getByRole("button", { name: "New product" }).click();
  await dialog(page).getByLabel("Product name").fill("Cast iron pan 30 cm");
  await dialog(page).getByLabel("Category").selectOption({ label: "Kitchen › Pans" });
  await dialog(page).getByLabel("SKU of the first variant").fill("cg26");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(dialog(page).getByText("This SKU is already used.")).toBeVisible();
  await expect(dialog(page).getByLabel("Product name")).toHaveValue("Cast iron pan 30 cm");
  await dialog(page).getByLabel("SKU of the first variant").fill("CG30");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cast iron pan 30 cm" })).toBeVisible();
  await expect(toast(page)).toContainText("Draft created");

  // Thiếu thuộc tính bắt buộc của danh mục: mở bán bị từ chối, mục "Before going on sale" nêu rõ.
  await expect(page.getByText("catalog.required_attributes_missing")).toBeVisible();
  await page.getByRole("button", { name: "Put on sale" }).click();
  await expect(page.locator(".falert")).toHaveAttribute(
    "data-code",
    "catalog.required_attributes_missing",
  );

  // Điền thuộc tính bắt buộc rồi mở bán được; có Hoàn tác.
  await page.getByLabel("Origin").selectOption({ label: "Vietnam" });
  await page.getByRole("checkbox", { name: "Cast iron" }).check();
  await page.getByRole("checkbox", { name: "Gas", exact: true }).check();
  await page.getByLabel("Responsible organisation").fill("Bếp Mộc (mẫu)");
  await page.getByRole("button", { name: "Save attributes" }).click();
  await expect(toast(page)).toContainText("Attributes saved");
  await page.reload();
  await expect(page.getByText("Ready to go on sale")).toBeVisible();
  await page.getByRole("button", { name: "Put on sale" }).click();
  await expect(toast(page)).toContainText("On sale");
  await expect(page.locator(".phead .badge").first()).toHaveText(/On sale/);
});

test("bảng giá: giá kế thừa và ghi đè, giải giá vì sao, dòng giá chỉ nhận số nguyên đồng", async ({
  page,
}) => {
  await signIn(page, "/catalog/prices");
  // CN Cầu Giấy ghi đè bát gốm, kế thừa chảo gang từ trụ sở.
  const bowls = page.getByRole("row", { name: /Blue glaze ceramic bowls/ });
  await expect(bowls).toContainText("440,000 ₫");
  await expect(bowls).toContainText("Overridden: Giá CN Cầu Giấy");
  await expect(page.getByRole("row", { name: /Cast iron pan · 26 cm/ })).toContainText(
    "Inherited from Giá bán lẻ toàn chuỗi",
  );

  // Giải giá: bảng của cửa hàng không có dòng cho CG26 nên kế thừa.
  await page.getByRole("button", { name: "Resolve price" }).click();
  const result = page.locator(".cat-resolve");
  await expect(result).toContainText("690,000 ₫");
  await expect(result).toContainText("No row for this variant at that time");

  // Số tiền dạng "1.000,50" không nhận.
  await page.getByRole("button", { name: "Add price row" }).first().click();
  await dialog(page).getByLabel("Variant (SKU or barcode)").fill("CG24");
  await dialog(page).getByLabel("Price (đồng)").fill("1.000,50");
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    dialog(page).getByText("A whole number of đồng, no separators (690000)."),
  ).toBeVisible();
  await dialog(page).getByLabel("Price (đồng)").fill("600000");
  await dialog(page).getByLabel("Reference").fill("e2e-gia-1");
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page)).toContainText("Price row added");
});

test("nhập CSV: chạy thử không ghi gì, lỗi theo dòng, rồi nhập thật", async ({ page }) => {
  await signIn(page, "/catalog/imports");
  await page
    .getByLabel("Or paste CSV")
    .fill(
      "sku,name,category,tax_category,price\nE2E-1,Khay gỗ,Dao và thớt,vat.standard_reducible,150000\nE2E-2,,,,1.000\n",
    );
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByText("2 rows: 1 to create, 0 to update by SKU")).toBeVisible();
  await expect(page.getByText("Row 3 · price")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(toast(page)).toContainText("Imported 1 of 2 rows");
  await expect(page.getByRole("link", { name: "pasted.csv" }).first()).toBeVisible();
});

test("tồn kho: điều chỉnh cần lý do, gửi phiếu chuyển, kiểm kê thiếu lý do chưa áp dụng được", async ({
  page,
}) => {
  await signIn(page, "/catalog/inventory");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 42")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Glass food box 1 L \(set of 3\).*CN Quận 3/ }),
  ).toContainText("Out, backorders allowed");

  // Điều chỉnh không có lý do: báo dưới ô, không ghi gì.
  await page.getByRole("button", { name: "Adjust stock" }).first().click();
  await dialog(page).getByLabel("Warehouse").selectOption({ label: "Kho Thủ Đức" });
  await dialog(page).getByLabel("SKU or barcode").fill("TG35");
  await dialog(page).getByLabel("Quantity (+ or −)").fill("-2");
  await dialog(page).getByLabel("Note").fill("Nứt khi bốc xếp");
  await dialog(page).getByRole("button", { name: "Record adjustment" }).click();
  await expect(dialog(page).getByText("Choose a reason.")).toBeVisible();
  await dialog(page).getByLabel("Reason").selectOption("damaged");
  await dialog(page).getByRole("button", { name: "Record adjustment" }).click();
  await expect(toast(page)).toContainText("Adjustment recorded");

  // Sổ biến động có dòng vừa ghi.
  await page.getByRole("link", { name: "Stock ledger" }).click();
  await expect(
    page.getByRole("row", { name: /Rain tree cutting board 35 cm/ }).first(),
  ).toContainText("−2");

  // Gửi phiếu chuyển nháp: hỏi lại, nêu hệ quả.
  await page.getByRole("link", { name: "Transfers" }).click();
  const draft = page.getByRole("row", { name: /CK-0220/ });
  await draft.getByRole("button", { name: "Ship" }).click();
  await expect(dialog(page)).toContainText("Stock leaves Kho Thủ Đức now");
  await dialog(page).getByRole("button", { name: "Ship" }).click();
  await expect(toast(page)).toContainText("Shipped");
  await expect(page.getByRole("row", { name: /CK-0220/ })).toContainText("In transit");

  // Kiểm kê: còn dòng lệch chưa có lý do thì áp dụng bị từ chối.
  await page.getByRole("link", { name: "Stock counts" }).click();
  await page.getByRole("link", { name: "KK-0031" }).click();
  await page.getByRole("button", { name: "Apply differences" }).click();
  await dialog(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog(page).locator(".falert")).toHaveAttribute(
    "data-code",
    "inventory.reason_required",
  );
});
