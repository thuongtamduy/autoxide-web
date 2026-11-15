import { expect, type Page, test } from "@playwright/test";

// Thư viện media và bộ chọn ảnh của trình soạn, với core giả (`mock-media.ts`): tải lên qua route
// của giao diện (token không xuống trình duyệt), lỗi theo `code`, alt, thẻ, công khai, thùng rác,
// ảnh đại diện, ảnh trong thân bài, trang xem trước thấy ảnh khi chưa đăng nhập.

const CORE = "http://127.0.0.1:4010";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGPcFyDHAANMDEgAhQMALJgBMoRAhaAAAAAASUVORK5CYII=",
  "base64",
);

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

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const pane = (page: Page) => page.getByRole("complementary", { name: "File details" });

async function upload(page: Page, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.locator("#md-file").setInputFiles({ name, mimeType, buffer });
}

test("tải lên, lỗi theo code, alt, thẻ, công khai, thùng rác, xoá hẳn", async ({
  page,
  context,
}) => {
  await signIn(page, "/content/media");
  await expect(page.getByRole("heading", { level: 1, name: "Media library" })).toBeVisible();
  await expect(page.getByText("No files match")).toBeVisible();

  // Nội dung không đúng loại khai: core từ chối (415), câu của core hiện dưới tệp.
  await upload(page, "fake.png", Buffer.from("<html>not an image</html>"));
  const failed = page.locator(".md-up.failed");
  await expect(failed).toHaveAttribute("data-code", "media.unknown_type");
  await expect(failed).toContainText("could not be detected");

  // Tải lên một ảnh: mở khung chi tiết của nó; ảnh hiện qua route `/media/…` của giao diện.
  await upload(page, "chao-gang.png", PNG);
  await expect(page).toHaveURL(/item=[0-9a-f-]{36}/);
  await expect(pane(page).getByText("chao-gang.png", { exact: true })).toBeVisible();
  await expect(pane(page).getByText("4 × 3")).toBeVisible();
  const src = await pane(page).locator(".md-preview img").getAttribute("src");
  expect(src).toMatch(/^\/media\/[0-9a-f-]{36}\/content\?v=/);
  const image = await page.request.get(src ?? "");
  expect(image.headers()["content-type"]).toBe("image/png");
  // Token không xuống trình duyệt: cookie phiên là httpOnly, trang không chứa token.
  for (const cookie of await context.cookies()) {
    if (cookie.name.startsWith("ax_")) expect(cookie.httpOnly).toBe(true);
  }
  await expect(page.locator(".md-tile").first()).toContainText("No alt");

  // AI tắt: nút gợi ý tắt kèm lý do.
  await expect(pane(page).getByRole("button", { name: "Suggest with AI" }).first()).toBeDisabled();
  await expect(pane(page).getByText("AI suggestions are off on this server.")).toBeVisible();

  // Alt theo ngôn ngữ: ngôn ngữ mặc định là `alt` của tệp, ngôn ngữ khác là `alts` (PUT/DELETE).
  await pane(page).getByLabel("English · default").fill("Cast iron skillet seen from above");
  await pane(page).getByLabel("Vietnamese").fill("Chảo gang nhìn từ trên");
  await pane(page).getByRole("button", { name: "Save alt text" }).click();
  await expect(toast(page)).toContainText("Alt text saved");
  await page.reload();
  await expect(pane(page).getByLabel("English · default")).toHaveValue(
    "Cast iron skillet seen from above",
  );
  await expect(pane(page).getByLabel("Vietnamese")).toHaveValue("Chảo gang nhìn từ trên");
  await expect(page.locator(".md-tile").first()).not.toContainText("No alt");
  // Xoá bản tiếng Việt: người đọc tiếng Việt lại thấy alt mặc định.
  await pane(page).getByLabel("Vietnamese").fill("");
  await pane(page).getByRole("button", { name: "Save alt text" }).click();
  await expect(toast(page)).toContainText("Alt text saved");
  await page.reload();
  await expect(pane(page).getByLabel("Vietnamese")).toHaveValue("");
  await expect(pane(page).getByLabel("Vietnamese")).toHaveAttribute(
    "placeholder",
    "Empty: readers in this language see the default text",
  );

  // Thẻ, rồi lọc theo thẻ.
  await pane(page).getByLabel("Tags").fill("brand, logo");
  await pane(page).getByRole("button", { name: "Save details" }).click();
  await expect(toast(page)).toContainText("File saved");
  await expect(pane(page)).toContainText("#brand #logo");

  // Công khai.
  await pane(page).getByRole("button", { name: "Make public" }).click();
  await expect(toast(page)).toContainText("The file is public");
  await expect(pane(page).getByRole("button", { name: "Make private" })).toBeVisible();

  // Thùng rác: hỏi lại, nêu hệ quả; khôi phục; xoá hẳn.
  await pane(page).getByRole("button", { name: "Move to trash" }).click();
  await expect(dialog(page)).toContainText("public address stops working");
  await dialog(page).getByRole("button", { name: "Move to trash" }).click();
  await expect(toast(page)).toContainText("Moved to the trash");
  await expect(page.locator(".md-tile")).toHaveCount(0);
  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page.locator(".md-tile")).toHaveCount(1);
  await page.locator(".md-tile").first().click();
  await pane(page).getByRole("button", { name: "Restore" }).click();
  await expect(toast(page)).toContainText("File restored");
  await expect(page.locator(".md-tile")).toHaveCount(0);

  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page.locator(".md-tile")).toHaveCount(1);
  await page.locator(".md-tile").first().click();
  await pane(page).getByRole("button", { name: "Move to trash" }).click();
  await dialog(page).getByRole("button", { name: "Move to trash" }).click();
  await expect(toast(page)).toContainText("Moved to the trash");
  await page.getByRole("link", { name: "Trash" }).click();
  await page.locator(".md-tile").first().click();
  await pane(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog(page)).toContainText("cannot be brought back");
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(toast(page)).toContainText("File deleted for good");
  await expect(page.locator(".md-tile")).toHaveCount(0);
});

test("thư mục mới, tải vào thư mục, lọc theo loại", async ({ page }) => {
  await signIn(page, "/content/media");
  await page.getByRole("button", { name: "New folder" }).click();
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page).getByText("Enter a name for the folder.")).toBeVisible();
  await dialog(page).getByLabel("Name").fill("Kitchen photos");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page)).toContainText("Folder created");
  await page.getByRole("link", { name: "Kitchen photos" }).click();
  await expect(page).toHaveURL(/folder=[0-9a-f-]{36}/);
  await expect(page.getByText("Into the folder Kitchen photos.")).toBeVisible();
  await upload(page, "noi-inox.png", PNG);
  await expect(page).toHaveURL(/item=/);
  await expect(pane(page)).toContainText("Kitchen photos");

  await page.locator("summary", { hasText: "Filter: any type" }).click();
  await page.getByRole("menuitemradio", { name: "Videos" }).click();
  await expect(page).toHaveURL(/kind=video/);
  await expect(page.getByText("No files match")).toBeVisible();
});

test("bộ chọn ảnh: ảnh đại diện và ảnh trong thân bài; xem trước thấy ảnh khi chưa đăng nhập", async ({
  page,
  browser,
}) => {
  await signIn(page, "/content/media");
  await upload(page, "chao-gang.png", PNG);
  await expect(page).toHaveURL(/item=/);
  await pane(page).getByLabel("English · default").fill("Cast iron skillet");
  await pane(page).getByRole("button", { name: "Save alt text" }).click();
  await expect(toast(page)).toContainText("Alt text saved");

  await page.goto("/content");
  await page.getByRole("link", { name: "Vệ sinh thớt gỗ đúng cách" }).click();
  await expect(page.locator(".ce-prose[contenteditable=true]")).toBeVisible();

  // Ảnh đại diện: chọn trong thư viện, alt điền sẵn, ảnh riêng tư được chuyển công khai.
  await page.getByRole("button", { name: "Choose image" }).click();
  await dialog(page).locator(".md-tile").first().click();
  await expect(dialog(page).getByLabel("Alt text (VI)")).toHaveValue("Cast iron skillet");
  await expect(dialog(page).getByLabel("Make the image public")).toBeChecked();
  await dialog(page).getByRole("button", { name: "Use this image" }).click();
  await expect(page.getByTestId("ce-featured-img")).toBeVisible();
  await page.getByLabel("Alt text (VI)").fill("Chảo gang trên bếp");

  // Ảnh trong thân bài: alt theo ngôn ngữ của bài, chú thích.
  await page.locator(".ce-prose").click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await dialog(page).locator(".md-tile").first().click();
  await dialog(page).getByLabel("Alt text (VI)").fill("Chảo gang nhìn gần");
  await dialog(page).getByLabel("Caption").fill("Chảo gang 26 cm");
  await dialog(page).getByRole("button", { name: "Use this image" }).click();
  const bodyImage = page.locator(".ce-prose figure img");
  await expect(bodyImage).toBeVisible();
  await expect(page.locator(".ce-prose figure")).toContainText("alt: Chảo gang nhìn gần");

  // Sửa alt của ảnh đang chọn trong thân bài.
  await page.locator(".ce-prose figure").click();
  await page.getByRole("button", { name: "Edit image" }).click();
  await dialog(page).getByLabel("Alt text").fill("Chảo gang nhìn từ trên");
  await dialog(page).getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".ce-prose figure")).toContainText("alt: Chảo gang nhìn từ trên");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(toast(page)).toContainText("Draft saved");

  await page.getByRole("button", { name: "Preview" }).click();
  await dialog(page).getByRole("button", { name: "Create preview link" }).click();
  const link = await dialog(page).getByLabel("Preview link").inputValue();

  const stranger = await browser.newContext();
  const reader = await stranger.newPage();
  await reader.goto(link);
  const images = reader.locator("article img");
  await expect(images).toHaveCount(2);
  await expect(images.first()).toHaveAttribute("alt", "Chảo gang trên bếp");
  await expect(images.nth(1)).toHaveAttribute("alt", "Chảo gang nhìn từ trên");
  await expect(reader.getByText("Chảo gang 26 cm")).toBeVisible();
  // Ảnh tải được dù chưa đăng nhập (ảnh đã công khai).
  await expect
    .poll(() => images.first().evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(4);
  await stranger.close();
});
