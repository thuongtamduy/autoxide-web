import { expect, type Page, test } from "@playwright/test";

// Màn Menu của website, gọi module `menus` của core giả (`mock-menus.ts`, đúng hình dạng của
// `openapi.json`): danh sách, tạo, sửa cây, lỗi trước khi gửi, lỗi 422 của core, 412 khi người khác
// vừa lưu, lưu, xem trước mặt tiền (bản nháp và menu công khai), xoá. Loại thương mại trong ô chọn
// đối tượng là dữ liệu mẫu (W-006): core từ chối khi lưu. Menu cũ của `content` chỉ đọc.

const CORE = "http://127.0.0.1:4010";
const MAIN = "01a1e200-0000-7000-8000-0000000000a1";

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

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.getByRole("dialog");
const row = (page: Page, text: string) => page.locator(".mn-rowbtn", { hasText: text });

test("menu thật: lỗi trước khi gửi, lỗi 422 của core, 412, lưu, xem trước", async ({
  page,
  request,
}) => {
  await signIn(page, "/content/menus");
  await expect(page.getByRole("heading", { level: 1, name: "Website menus" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for the menus module")).toHaveCount(0);
  const sub = page.getByRole("navigation", { name: "Content", exact: true });
  await expect(sub.getByRole("link", { name: "Menus" })).toHaveAttribute("aria-current", "page");
  // Danh sách thật: main, footer; main mở sẵn. Mục trỏ tới danh mục lấy tên của danh mục.
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText("Editing menu")).toContainText("main");
  await expect(row(page, "Chọn mua")).toContainText("Content category");

  // Đường dẫn sai: báo trước khi gửi, chỉ đúng mục.
  await row(page, "Khuyến mại").click();
  await page.getByLabel("Address", { exact: true }).fill("//evil.example.com");
  await expect(page.getByText("//host is not accepted")).toBeVisible();
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.locator(".mn-alert")).toHaveAttribute("data-code", "local");
  await expect(page.locator(".mn-alert")).toContainText("Khuyến mại");
  await page.getByLabel("Address", { exact: true }).fill("/khuyen-mai");

  // Thụt vào, kéo ra; thêm mục con.
  await page.getByRole("button", { name: "Indent" }).click();
  await expect(page.locator(".mn-row.on")).toHaveCSS("margin-inline-start", "22px");
  await page.getByRole("button", { name: "Move out" }).click();
  await expect(page.locator(".mn-row.on")).toHaveCSS("margin-inline-start", "0px");
  await page.getByRole("button", { name: "Sub-item" }).click();
  await expect(toast(page)).toContainText("Item added");
  await page.getByLabel("Label", { exact: true }).fill("Giảm giá tháng này");

  // Trỏ tới danh mục sản phẩm (dữ liệu mẫu, core chưa có loại này): core từ chối, giao diện hiện
  // đúng mã của core và đưa tới mục bị lỗi.
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByLabel("Kind of record").selectOption("catalog.category");
  await expect(page.locator(".mn-form .b-sample")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Record", exact: true })
    .selectOption({ label: "Dụng cụ nấu" });
  await page.getByRole("button", { name: "Save menu" }).click();
  const refused = page.locator(".mn-alert");
  await expect(refused).toHaveAttribute("data-code", "menus.ref_unknown_kind");
  await expect(refused).toContainText("Khuyến mại › Giảm giá tháng này");
  await expect(refused).toContainText("catalog.category");
  await expect(page.locator(".mn-row.on")).toHaveClass(/bad/);
  await page.getByRole("button", { name: "Address", exact: true }).click();
  await page.getByLabel("Address", { exact: true }).fill("/giam-gia");

  // Người khác vừa lưu: 412, thay đổi còn trên màn; tải lại bản mới.
  await request.post(`${CORE}/__menus/bump`, { data: { id: MAIN } });
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.locator(".mn-alert")).toHaveAttribute("data-code", "precondition_failed");
  await expect(row(page, "Giảm giá tháng này")).toBeVisible();
  await page.getByRole("button", { name: "Load the new version" }).click();
  await expect(row(page, "Người khác thêm")).toBeVisible();
  await expect(row(page, "Giảm giá tháng này")).toHaveCount(0);
  await expect(page.locator(".mn-alert")).toHaveCount(0);

  // Lưu được khi đúng phiên bản; mục đang chọn giữ nguyên dù core cấp id mới.
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Liên hệ");
  await page.getByLabel("Address", { exact: true }).fill("mailto:hotro@example.com");
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(toast(page)).toContainText("Menu saved");
  await expect(page.getByRole("button", { name: "Save menu" })).toBeDisabled();
  await expect(page.locator(".mn-row.on")).toContainText("Liên hệ");
  await page.reload();
  await expect(row(page, "Liên hệ")).toBeVisible();

  // Xem trước: bản nháp mở bảng xổ của nhóm; menu công khai của core có mục vừa lưu.
  await page.locator(".mn-baritem", { hasText: "Hỗ trợ" }).click();
  await expect(page.locator(".mn-mega")).toContainText("Tra cứu đơn hàng");
  await page.getByRole("button", { name: "On the website" }).click();
  const bar = page.getByRole("navigation", { name: "Category bar" });
  await expect(bar).toContainText("Liên hệ");
  await expect(bar).toContainText("Chọn mua");
  await expect(bar.locator(".mn-badge")).toHaveText("−10%");

  // Lệnh nhập menu cũ: xem trước tính từ menu cũ thật, lệnh chạy trên máy chủ; ngày sunset lấy từ
  // header `Sunset` của core.
  const imports = page.locator("#import");
  await expect(imports.locator(".mn-improws")).toContainText("blog · VI");
  await expect(imports.locator(".mn-improws")).toContainText("Will be created");
  await expect(imports).toContainText("autoxide task menus.import_content_menus");
  await expect(imports.locator(".badge.b-warn")).toContainText("Old API ends");
});

test("menu thật: tạo (chép từ menu có sẵn), trùng khoá, xoá", async ({ page }) => {
  await signIn(page, "/content/menus");
  await page.getByRole("button", { name: "New menu" }).click();
  await dialog(page).getByLabel("Key").fill("main");
  await dialog(page).getByLabel("Language").selectOption("vi");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  // 409 `menus.menu_exists` của core, dưới ô khoá.
  await expect(dialog(page)).toContainText("already exists");

  await dialog(page).getByLabel("Key").fill("account");
  await dialog(page).getByLabel("Start from").selectOption({ label: "footer · VI" });
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page)).toContainText("Menu created");
  await expect(page).toHaveURL(/\/content\/menus\?menu=/);
  await expect(page.getByText("Editing menu")).toContainText("account");
  await expect(row(page, "Về chúng tôi")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);

  const account = page.locator("tbody tr", { hasText: "account" });
  await account.getByRole("button", { name: "Delete" }).click();
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Menu deleted");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  // Menu đang mở vừa bị xoá: màn mở menu main.
  await expect(page.getByText("Editing menu")).toContainText("main");
});
