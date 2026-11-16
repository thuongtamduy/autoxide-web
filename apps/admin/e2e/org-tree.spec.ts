import { expect, type Page, test } from "@playwright/test";

// Màn "Cây tổ chức": cả màn là dữ liệu mẫu (W-006, W-012), chờ API của bước 34. Kho mẫu nằm trong
// tiến trình máy chủ của giao diện, nên các bước nối nhau trong một test. Role để mời là role thật
// của core giả.

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

test("cây, thành viên theo độ sâu, cài đặt kế thừa; thêm nút con có Hoàn tác; tách nhánh; mời", async ({
  page,
}) => {
  await signIn(page, "/org");
  await expect(page.getByRole("heading", { level: 1, name: "Organization tree" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 34")).toBeVisible();
  const sub = page.getByRole("navigation", { name: "Organization", exact: true });
  await expect(sub.getByRole("link", { name: "Organization tree" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Chi tiết nút: người gán trực tiếp và người từ nút cha có độ sâu chảy xuống.
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
  await expect(members.locator("tbody tr", { hasText: "Minh Anh" })).toHaveCount(0);
  const settings = page.locator("section", {
    has: page.getByRole("heading", { name: "Effective settings" }),
  });
  await expect(settings.locator("tbody tr", { hasText: "Time zone" })).toContainText(
    "Inherited from Trụ sở",
  );

  // Đặt riêng rồi dùng lại giá trị kế thừa.
  const language = settings.locator("tbody tr", { hasText: "Language" });
  await language.getByRole("button", { name: "Set here" }).click();
  await dialog(page).getByLabel("Language").selectOption("en");
  await dialog(page).getByRole("button", { name: "Save setting" }).click();
  await expect(toast(page)).toHaveText("Setting saved.");
  await expect(language).toContainText("Set at this unit");
  await language.getByRole("button", { name: "Use inherited value" }).click();
  await expect(toast(page)).toHaveText("This unit now uses the inherited value.");
  await expect(language).toContainText("Inherited from Trụ sở");

  // Thêm nút con: lỗi theo ô (trống, mã trùng), rồi thêm được, Hoàn tác thì nút được lưu trữ.
  await page.getByRole("button", { name: "Add child unit" }).click();
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("One field needs fixing.");
  await expect(dialog(page).getByLabel("Unit name")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Unit name").fill("Quầy Quận 3");
  await dialog(page).getByLabel("Internal code (optional)").fill("ch-q3");
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(dialog(page).getByText("This value is already in use.")).toBeVisible();
  await dialog(page).getByLabel("Internal code (optional)").fill("CH-Q3B");
  await dialog(page).getByRole("button", { name: "Add unit" }).click();
  await expect(toast(page)).toContainText("Unit added under CN Quận 3.");
  await expect(page.getByRole("heading", { level: 2, name: "Quầy Quận 3" })).toBeVisible();
  await expect(node(page, "Quầy Quận 3")).toHaveAttribute("aria-current", "page");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toHaveText("The new unit was archived.");
  await page.reload();
  await expect(node(page, "Quầy Quận 3")).toHaveCount(0);

  // Yêu cầu tách: phải đánh dấu ô xác nhận (việc không huỷ được giữa chừng).
  await node(page, "CN Quận 3").click();
  await page.getByRole("button", { name: "Request split" }).click();
  await dialog(page).getByRole("button", { name: "Send request" }).click();
  await expect(dialog(page).getByText("Tick this box to confirm.")).toBeVisible();
  await dialog(page)
    .getByLabel(/I understand the split runs/)
    .check();
  await dialog(page).getByRole("button", { name: "Send request" }).click();
  await expect(toast(page)).toContainText("Split request for CN Quận 3 sent");
  await expect(page.getByText("A split request is waiting")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request split" })).toHaveCount(0);

  // Mời vào đúng nút này (lời mời mẫu của `org.ts`, role thật của core).
  await page.getByRole("button", { name: "Invite staff" }).click();
  await dialog(page).getByLabel("Email").fill("thu.ngan.q3@example.com");
  await dialog(page).getByLabel("editor").check();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(members.locator("tbody tr", { hasText: "thu.ngan.q3@example.com" })).toContainText(
    "Invited · waiting",
  );
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
