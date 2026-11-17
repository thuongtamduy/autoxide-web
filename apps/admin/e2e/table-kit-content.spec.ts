import { expect, type Page, test } from "@playwright/test";

// Bộ công cụ bảng (W-058) ở Nội dung và Tiếp thị: chọn nhiều + thanh hàng loạt (core chỉ có lệnh từng
// bản ghi: lặp, gom lỗi theo dòng), "⋯" trên dòng, sắp theo cột chỉ khi nguồn sắp được (`order` /
// `sort` của core), phân trang theo con trỏ không tổng; Tiếp thị liên kết là dữ liệu mẫu (có tổng).

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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const rows = (page: Page) => page.locator("tbody tr");
const bar = (page: Page) => page.locator(".bulkbar");
const selectAll = (page: Page) =>
  page.getByRole("checkbox", { name: "Select every row on this page" });

/** Mở "⋯" của một dòng, trả menu của nó. */
async function openMenu(page: Page, name: string) {
  await page.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  return page.getByRole("menu", { name: `More actions for ${name}` });
}

test("bài viết: sắp theo giờ sửa, ⋯ theo trạng thái, gỡ đăng và xoá hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/content");
  await expect(rows(page)).toHaveCount(2);
  const firstTitle = await rows(page).first().locator(".ce-title-link").textContent();

  // Chỉ cột "Sửa lần cuối" sắp được (`sort=updated_at` + `order` của core).
  const edited = page.getByRole("columnheader", { name: "Last edited" });
  await expect(edited).toHaveAttribute("aria-sort", "descending");
  await edited.getByRole("link").click();
  await expect(page).toHaveURL(/sort=updated&dir=asc/);
  await expect(page.getByRole("columnheader", { name: "Last edited" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(rows(page).last().locator(".ce-title-link")).toHaveText(firstTitle ?? "");

  // "⋯" theo trạng thái: bài đã đăng có Gỡ đăng; bài chờ duyệt có Duyệt và đăng. Không nút nào trên dòng.
  await expect(rows(page).getByRole("button", { name: "Approve and publish" })).toHaveCount(0);
  let menu = await openMenu(page, "Vệ sinh thớt gỗ đúng cách");
  await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Unpublish", "Archive", "Delete"]);
  await page.keyboard.press("Escape");
  menu = await openMenu(page, "Bảo quản dao bếp");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open",
    "Approve and publish",
    "Archive",
    "Delete",
  ]);
  await page.keyboard.press("Escape");

  // Gỡ đăng hàng loạt: hỏi lại, lặp lệnh từng bài của core.
  await page.getByRole("checkbox", { name: "Select Vệ sinh thớt gỗ đúng cách" }).check();
  await expect(bar(page)).toContainText("1 selected");
  await bar(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(dialog(page)).toContainText("Unpublish the selected posts?");
  await dialog(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
  await expect(rows(page).filter({ hasText: "Vệ sinh thớt gỗ" })).toContainText("Draft");

  // Gỡ đăng bài chưa đăng: core từ chối, lỗi nằm đúng dòng, dòng hỏng vẫn được chọn.
  await page.getByRole("checkbox", { name: "Select Bảo quản dao bếp" }).check();
  await bar(page).getByRole("button", { name: "Unpublish" }).click();
  await dialog(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(toast(page)).toContainText("Done 0/1, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText("Bảo quản dao bếp:");
  await expect(page.getByRole("checkbox", { name: "Select Bảo quản dao bếp" })).toBeChecked();

  // Xoá cả trang.
  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("This cannot be undone.");
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText(/No posts or pages yet/)).toBeVisible();
});

test("chuyển hướng và danh mục: Sửa trên dòng, xoá trong ⋯ và hàng loạt", async ({ page }) => {
  await signIn(page, "/content/structure/redirects");
  await page.getByRole("button", { name: "Add redirect" }).click();
  await dialog(page).getByLabel("From").fill("/khuyen-mai-cu");
  await dialog(page).getByLabel("Address", { exact: true }).fill("/khuyen-mai");
  await dialog(page).getByRole("button", { name: "Add" }).click();
  await expect(toast(page)).toContainText("Redirect added");
  await expect(rows(page)).toHaveCount(2);
  const row = rows(page).filter({ hasText: "/khuyen-mai-cu" });
  await expect(row.getByRole("button", { name: "Edit" })).toBeVisible();
  const menu = await openMenu(page, "/khuyen-mai-cu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Delete"]);
  await page.keyboard.press("Escape");

  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Delete the selected redirects?");
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText("No redirects match.")).toBeVisible();

  await page.goto("/content/structure/terms");
  const category = rows(page).filter({ hasText: "Chọn mua" });
  await expect(category.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Chọn mua" }).check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Delete the selected categories?");
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
  await expect(page.getByText("No categories yet.")).toBeVisible();
});

test("thư viện media (dạng bảng): sắp theo tên, chuyển thư mục, thùng rác, khôi phục hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/content/media");
  await page.getByRole("button", { name: "New folder" }).click();
  await dialog(page).getByLabel("Name").fill("Ảnh bếp");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page)).toContainText("Folder created");
  await page
    .locator("#md-file")
    .setInputFiles({ name: "b-thot.png", mimeType: "image/png", buffer: PNG });
  await expect(page).toHaveURL(/item=/);
  await page
    .locator("#md-file")
    .setInputFiles({ name: "a-chao.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".md-tile")).toHaveCount(2);
  // Lưới chỉ để xem: chọn nhiều ở dạng bảng.
  await expect(
    page.getByText("To select several files at once, switch the view to Table."),
  ).toBeVisible();

  await page.goto("/content/media?view=table");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("columnheader", { name: "Uploaded" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await page.getByRole("columnheader", { name: "File" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=name&dir=asc/);
  await expect(rows(page).first()).toContainText("a-chao.png");

  const menu = await openMenu(page, "a-chao.png");
  await expect(menu.getByRole("menuitem")).toHaveText(["Open details", "Move to trash"]);
  await page.keyboard.press("Escape");

  // Chuyển thư mục: chọn thư mục trong hộp thoại của thao tác.
  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Move to folder" }).click();
  await dialog(page).getByLabel("Folder").selectOption({ label: "Ảnh bếp" });
  await dialog(page).getByRole("button", { name: "Move to folder" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(rows(page).first()).toContainText("Ảnh bếp");

  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Move to trash" }).click();
  await expect(dialog(page)).toContainText("Move the selected files to the trash?");
  await dialog(page).getByRole("button", { name: "Move to trash" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText("No files match")).toBeVisible();

  await page.goto("/content/media?view=table&trash=1");
  await expect(rows(page)).toHaveCount(2);
  await selectAll(page).check();
  await expect(bar(page).getByRole("button", { name: "Delete for good" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Restore" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText("No files match")).toBeVisible();
});

test("biểu mẫu: ⋯ của form; bài nộp sắp theo giờ gửi, một nút trên dòng, đánh dấu và xoá hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/marketing/forms");
  const menu = await openMenu(page, "Liên hệ");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open",
    "Edit form",
    "Close form",
    "Copy form key",
    "Copy public API address",
    "Delete form",
  ]);
  await menu.getByRole("menuitem", { name: "Close form" }).click();
  await expect(toast(page)).toContainText("Form closed");
  await expect(rows(page).first()).toContainText("Closed");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(rows(page).first()).toContainText("Open");

  await page.getByRole("link", { name: "Liên hệ" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText("Phan Mỹ Duyên");
  const sent = page.getByRole("columnheader", { name: "Sent" });
  await expect(sent).toHaveAttribute("aria-sort", "descending");
  await sent.getByRole("link").click();
  await expect(page).toHaveURL(/sort=created&dir=asc/);
  await expect(rows(page).first()).toContainText("Lý Minh Châu");

  // Một nút trên dòng (nước đi đầu), còn lại trong "⋯".
  const first = rows(page).first();
  await expect(first.getByRole("button", { name: "Mark as read" })).toBeVisible();
  const more = await openMenu(page, "Lý Minh Châu");
  await expect(more.getByRole("menuitem")).toHaveText([
    "Open",
    "Archive",
    "Mark as spam",
    "Delete",
  ]);
  await page.keyboard.press("Escape");

  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Mark as read" }).click();
  await expect(toast(page)).toContainText("Done 3/3");
  await expect(rows(page).filter({ hasText: "Read" })).toHaveCount(3);

  await page.getByRole("checkbox", { name: "Select Lý Minh Châu" }).check();
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Delete the selected submissions for good?");
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
  await expect(rows(page)).toHaveCount(2);
});

test("bản tin: ⋯ của chiến dịch, xoá hàng loạt; danh sách không gửi sắp theo giờ thêm, gỡ hàng loạt", async ({
  page,
}) => {
  await signIn(page, "/marketing/newsletter");
  const menu = await openMenu(page, "Bản tin tuần 46");
  await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Delete"]);
  await page.keyboard.press("Escape");
  await selectAll(page).check();
  await expect(bar(page).getByRole("button")).toContainText([
    "Pause",
    "Resume",
    "Cancel campaign",
    "Delete",
  ]);
  await bar(page).getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Delete the selected campaigns?");
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
  await expect(page.getByText(/No campaign yet/)).toBeVisible();

  await page.goto("/marketing/newsletter/suppressions");
  for (const email of ["tra-ve@example.com", "khieu-nai@example.com"]) {
    await page.getByRole("button", { name: "Add address" }).click();
    await dialog(page).getByLabel("Email").fill(email);
    await dialog(page).getByRole("button", { name: "Add" }).click();
    await expect(toast(page)).toContainText("Address added");
  }
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("khieu-nai@example.com");
  await page.getByRole("columnheader", { name: "Since" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=created&dir=asc/);
  await expect(rows(page).first()).toContainText("tra-ve@example.com");
  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await dialog(page).getByRole("button", { name: "Remove from the list" }).click();
  await expect(toast(page)).toContainText("Done 2/2");
  await expect(page.getByText("No address on this list.")).toBeVisible();
});

test("lệnh cấm bình luận: gỡ hàng loạt", async ({ page }) => {
  await signIn(page, "/marketing/comments/bans");
  await page.getByRole("button", { name: "Ban", exact: true }).click();
  await dialog(page).getByLabel("By").selectOption("email");
  await dialog(page).getByLabel("Value").fill("spam@example.com");
  await dialog(page).getByLabel("Reason").fill("Quảng cáo");
  await dialog(page).getByRole("button", { name: "Ban", exact: true }).click();
  await expect(toast(page)).toContainText("Banned");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Select spam@example.com" }).check();
  await bar(page).getByRole("button", { name: "Lift" }).click();
  await expect(dialog(page)).toContainText("Lift the selected bans?");
  await dialog(page).getByRole("button", { name: "Lift ban" }).click();
  await expect(toast(page)).toContainText("Done 1/1");
  await expect(page.getByText("No ban.")).toBeVisible();
});

test("tiếp thị liên kết (mẫu): duyệt hàng loạt báo lỗi đúng dòng, hoa hồng sắp và có tổng, chi trả cả kỳ", async ({
  page,
}) => {
  await signIn(page, "/marketing/affiliate?chip=pending_verification");
  await expect(rows(page)).toHaveCount(1);
  const menu = await openMenu(page, "Tuấn Ăn Gì");
  await expect(menu.getByRole("menuitem")).toHaveText(["View details", "Terminate"]);
  await page.keyboard.press("Escape");
  // Chưa xác thực đủ: hàm mẫu từ chối, lỗi nêu đúng người.
  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toContainText("Done 0/1, 1 error");
  await expect(bar(page).getByRole("alert")).toContainText("Tuấn Ăn Gì:");

  // Hoa hồng: không có lệnh đổi tay; sắp theo tiền; phân trang có tổng.
  await page.goto("/marketing/affiliate/commissions");
  await expect(page.locator(".tpager-range")).toContainText(/^1–\d+ of \d+$/);
  await expect(page.locator("table").first().getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("columnheader", { name: "Commission" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=amount&dir=desc/);
  await expect(page.getByRole("columnheader", { name: "Commission" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  // Một đơn có thể có nhiều dòng hoa hồng: nhãn của "⋯" kèm tên sản phẩm cho khỏi trùng.
  await rows(page)
    .first()
    .getByRole("button", { name: /^More actions for BM-.+ · .+/ })
    .click();
  const items = page.getByRole("menu");
  await expect(items.getByRole("menuitem").first()).toHaveText("Open order");
  await expect(items.getByRole("menuitem", { name: "View partner" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Chi trả cả kỳ: chọn cả trang, ghi đã chi với một mã giao dịch của lô; lệnh không phải chi tay báo
  // lỗi đúng dòng (không ghi bừa).
  await page.goto("/marketing/affiliate/payouts");
  await selectAll(page).check();
  await bar(page).getByRole("button", { name: "Mark paid" }).click();
  await expect(dialog(page)).toContainText(
    "Every selected payout gets this code and today's date.",
  );
  await dialog(page).getByRole("button", { name: "Record as paid" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByLabel("Bank transaction code of the batch transfer").fill("LO-E2E-2611");
  await dialog(page).getByRole("button", { name: "Record as paid" }).click();
  await expect(toast(page)).toContainText(/Done \d\/4, \d errors/);
  await expect(bar(page).getByRole("alert")).toContainText("Nấu Cùng Minh:");
});
