import { expect, type Page, test } from "@playwright/test";

// Màn "Cây tổ chức", bộ chọn nút ở góc trên trái và tab "Hồ sơ công khai": module `organizations`
// của core (bước 34). Core giả: `mock-org.ts` (Trụ sở › Miền Nam › CN Quận 3, Kho Thủ Đức).

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const node = (page: Page, name: string) => page.locator(".ot-node", { hasText: name });

test("cây, thành viên theo nút, cài đặt kế thừa; thêm nút con có Hoàn tác", async ({ page }) => {
  await signIn(page, "/org");
  await expect(page.getByRole("heading", { level: 1, name: "Organization tree" })).toBeVisible();
  await expect(page.getByText(/Sample data/)).toHaveCount(0);
  const sub = page.getByRole("navigation", { name: "Organization", exact: true });
  await expect(sub.getByRole("link", { name: "Organization tree" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Số người ở mỗi nút: Ngô Mai được gán ở CN Quận 3.
  await expect(node(page, "CN Quận 3").locator(".cnt")).toHaveText("1");

  // Chi tiết nút: người gán trực tiếp và người từ nút cha.
  await node(page, "CN Quận 3").click();
  await expect(page).toHaveURL(/\/org\?unit=/);
  await expect(page.getByRole("heading", { level: 2, name: "CN Quận 3" })).toBeVisible();
  const members = page.locator("section", {
    has: page.getByRole("heading", { name: "Who works at this unit" }),
  });
  await expect(members.locator("tbody tr", { hasText: "Ngô Mai" })).toContainText(
    "Directly at this unit",
  );
  await expect(members.locator("tbody tr", { hasText: "Hoàng Nam" })).toContainText(
    "From Miền Nam",
  );
  // Role `editor` của core giả không cấp gì theo độ sâu; role `admin` (ở gốc) là cả khách.
  await expect(members.locator("tbody tr", { hasText: "admin@example.com" })).toContainText(
    "Whole customer",
  );
  const settings = page.locator("section", {
    has: page.getByRole("heading", { name: "Effective settings" }),
  });
  await expect(settings.locator("tbody tr", { hasText: "Time zone" })).toContainText(
    "Inherited from Trụ sở",
  );

  // Đặt riêng: giá trị sai thì lỗi của core dưới ô; đúng thì lưu; rồi dùng lại giá trị kế thừa.
  const currency = settings.locator("tbody tr", { hasText: "Currency" });
  await currency.getByRole("button", { name: "Set here" }).click();
  await dialog(page).getByLabel("Currency").fill("dong");
  await dialog(page).getByRole("button", { name: "Save setting" }).click();
  await expect(dialog(page).getByText("must be an ISO 4217 code")).toBeVisible();
  await dialog(page).getByLabel("Currency").fill("VND");
  await dialog(page).getByRole("button", { name: "Save setting" }).click();
  await expect(toast(page)).toHaveText("Setting saved.");
  await expect(currency).toContainText("Set at this unit");
  await expect(currency).toContainText("VND");
  await currency.getByRole("button", { name: "Use inherited value" }).click();
  await expect(toast(page)).toHaveText("This unit now uses the inherited value.");
  await expect(currency).toContainText("Server default");

  // Danh sách (ngôn ngữ website) sửa bằng chữ phân cách dấu phẩy.
  const languages = settings.locator("tbody tr", { hasText: "Website languages" });
  await languages.getByRole("button", { name: "Set here" }).click();
  await dialog(page).getByLabel("Website languages").fill("vi, en");
  await dialog(page).getByRole("button", { name: "Save setting" }).click();
  await expect(languages).toContainText("vi, en");

  // Bật / tắt (schema `boolean`): ô chọn Bật / Tắt thay cho ô chữ.
  const support = settings.locator("tbody tr", { hasText: "auth.support_access" });
  await support.getByRole("button", { name: "Set here" }).click();
  await dialog(page).locator("select[name=value]").selectOption("false");
  await dialog(page).getByRole("button", { name: "Save setting" }).click();
  await expect(support).toContainText("Off");

  // Thêm nút con: lỗi theo ô (trống, mã trùng), rồi thêm được, Hoàn tác thì nút được lưu trữ.
  await page.getByRole("button", { name: "Add child unit" }).click();
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(dialog(page).getByLabel("Unit name")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Unit name").fill("Quầy Quận 3");
  await dialog(page).getByLabel("Internal code (optional)").fill("ch-q3");
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(dialog(page).getByText("The code `ch-q3` is already in use.")).toBeVisible();
  await dialog(page).getByLabel("Internal code (optional)").fill("CH-Q3B");
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(toast(page)).toContainText("Unit added under CN Quận 3.");
  await expect(page.getByRole("heading", { level: 2, name: "Quầy Quận 3" })).toBeVisible();
  await expect(node(page, "Quầy Quận 3")).toHaveAttribute("aria-current", "page");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toHaveText("The new unit was archived.");
  await page.reload();
  await expect(node(page, "Quầy Quận 3")).toHaveCount(0);
});

test("bộ chọn nút góc trên trái: lọc menu theo website của nút, nhớ qua các màn", async ({
  page,
}) => {
  await signIn(page, "/content/menus");
  const picker = page.getByRole("button", { name: "Change organization unit" });
  await expect(picker).toContainText("All of Trụ sở");
  // Website của cả khách có menu `main` và `footer` của core giả.
  const mainMenu = page.locator("tbody tr", { hasText: "Category bar" });
  await expect(mainMenu).toBeVisible();

  await picker.click();
  await dialog(page).getByLabel("Find a store, warehouse, region…").fill("quận");
  await expect(dialog(page).getByRole("button", { name: /Miền Nam/ })).toHaveCount(0);
  await dialog(page)
    .getByRole("button", { name: /CN Quận 3/ })
    .click();
  await expect(picker).toContainText("CN Quận 3");
  // CN Quận 3 chưa có menu riêng.
  await expect(mainMenu).toHaveCount(0);

  // Nút đã chọn giữ khi sang màn khác; chọn lại gốc thì xem cả khách.
  await page.goto("/org");
  await expect(picker).toContainText("CN Quận 3");
  await picker.click();
  await dialog(page)
    .getByRole("button", { name: /All of Trụ sở/ })
    .click();
  await expect(picker).toContainText("All of Trụ sở");
});

test("hồ sơ công khai: địa chỉ theo danh mục hành chính, giờ mở cửa", async ({ page }) => {
  await signIn(page, "/org/access/public");
  await expect(page.getByRole("link", { name: "Public profiles" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const row = (name: string) => page.locator("tbody tr", { hasText: name });
  await expect(row("CN Quận 3")).toContainText("Public");
  await expect(row("Kho Thủ Đức")).toContainText("Not public");

  await row("Kho Thủ Đức").getByRole("link", { name: "Kho Thủ Đức" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Kho Thủ Đức" })).toBeVisible();
  const form = page.locator("form", { has: page.getByRole("button", { name: "Save profile" }) });
  await form.getByLabel("Show on the website").check();
  await form.getByLabel("Province or city").selectOption({ label: "Thành phố Hồ Chí Minh" });
  // Phường của tỉnh vừa chọn tải từ core.
  await form.getByLabel("Ward or commune").selectOption({ label: "Phường Bến Thành" });
  await form.getByLabel("Opens").fill("08:00");
  await form.getByRole("button", { name: "Save profile" }).click();
  // Thiếu số nhà và giờ đóng cửa: báo dưới từng ô trước khi gửi core.
  await expect(form.getByLabel("Street address")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Closes")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Street address").fill("12 Lê Lợi");
  await form.getByLabel("Closes").fill("07:00");
  await form.getByRole("button", { name: "Save profile" }).click();
  // Giờ đóng trước giờ mở: lỗi của core về ô giờ đóng.
  await expect(form.getByText("must be after the opening time")).toBeVisible();
  await form.getByLabel("Closes").fill("17:00");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(toast(page)).toContainText("Saved");
  await expect(row("Kho Thủ Đức")).toContainText("Public");
  await page.reload();
  await expect(form.getByLabel("Ward or commune")).toHaveValue("26734");
});

test("điện thoại: danh sách nút → chi tiết → quay lại", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/org");
  await expect(node(page, "Kho Thủ Đức")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who works at this unit" })).toBeHidden();
  await node(page, "Kho Thủ Đức").click();
  await expect(page.getByRole("heading", { level: 2, name: "Kho Thủ Đức" })).toBeVisible();
  await expect(node(page, "Miền Nam")).toBeHidden();
  const box = await page.getByRole("link", { name: "All units" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByRole("link", { name: "All units" }).click();
  await expect(node(page, "Miền Nam")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBe(0);
});
