import { expect, type Page, test } from "@playwright/test";

// Màn Menu của website: dữ liệu mẫu (W-006), chờ module `menus` của core. Menu cũ của `content`
// đọc từ core giả (chỉ đọc), làm nguồn cho "Nhập menu cũ". Kho mẫu nằm trong tiến trình máy chủ của
// giao diện, nên các bước nối nhau trong một test.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");

test("menu mẫu: sửa cây, lỗi trước khi lưu, người khác vừa lưu (412), lưu, xem trước, nhập menu cũ", async ({
  page,
}) => {
  await signIn(page, "/content/menus");
  await expect(page.getByRole("heading", { level: 1, name: "Website menus" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for the menus module")).toBeVisible();
  // Sổ điều hướng: Menu nằm giữa "Pages and structure" và "Media library".
  const sub = page.getByRole("navigation", { name: "Content", exact: true });
  await expect(sub.getByRole("link", { name: "Menus" })).toHaveAttribute("aria-current", "page");

  // Menu `main` mở sẵn. Chọn một mục, đặt đường dẫn sai: báo trước khi gửi, chỉ đúng mục.
  await page.locator(".mn-rowbtn", { hasText: "Khuyến mại" }).click();
  await page.getByLabel("Address", { exact: true }).fill("//evil.example.com");
  await expect(page.getByText("//host is not accepted")).toBeVisible();
  await page.getByRole("button", { name: "Save menu" }).click();
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

  // Người khác vừa lưu: 412, thay đổi còn trên màn; tải lại bản mới.
  await page.getByRole("button", { name: "Try: someone else saves" }).click();
  await expect(toast(page)).toContainText("Someone else saved");
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.locator(".mn-alert")).toHaveAttribute("data-code", "precondition_failed");
  await expect(page.locator(".mn-rowbtn", { hasText: "Giảm giá tháng này" })).toBeVisible();
  await page.getByRole("button", { name: "Load the new version" }).click();
  await expect(page.locator(".mn-rowbtn", { hasText: "Giảm giá tháng này" })).toHaveCount(0);

  // Lưu được khi đúng phiên bản.
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Liên hệ");
  await page.getByLabel("Address", { exact: true }).fill("mailto:hotro@example.com");
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(toast(page)).toContainText("Saved version");
  await expect(page.locator(".mn-rowbtn", { hasText: "Liên hệ" })).toBeVisible();

  // Mục trỏ tới đối tượng chưa công khai: sẽ không hiện; xem trước mặt tiền mở bảng xổ.
  await expect(page.locator(".mn-rowbtn", { hasText: "Workshop" })).toContainText("Will not show");
  await page.locator(".mn-baritem", { hasText: "Dụng cụ nấu" }).click();
  await expect(page.locator(".mn-mega")).toContainText("Chảo");
  await expect(page.locator(".mn-mega")).toContainText("Giảm 10% chảo gang");

  // Nhập menu cũ: chạy thử, chạy thật, chạy lại không nhân đôi.
  await page.getByRole("button", { name: "Preview the import" }).click();
  await expect(page.locator(".mn-improws")).toContainText("Will be created");
  await page.getByRole("button", { name: "Import old menus" }).last().click();
  await expect(toast(page)).toContainText("1 menu imported");
  await page.getByRole("button", { name: "Import old menus" }).last().click();
  await expect(page.locator(".mn-improws")).toContainText("Kept (already exists)");
  await expect(page.locator("tbody tr", { hasText: "blog" })).toHaveCount(1);
});
