import { expect, type Page, test } from "@playwright/test";

// Khách hàng, Kênh bán, Tiếp thị liên kết (bước 47–49) dựng hoàn toàn bằng dữ liệu mẫu (W-006, W-019). Kho
// mẫu nằm trong tiến trình máy chủ của giao diện, nên các bước nối nhau trong cùng một test. File chạy sau
// orders.spec.ts (thứ tự tên file): nhập đơn từ kênh làm tăng số đơn mà test Đơn hàng đếm.

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const toast = (page: Page) => page.locator(".toast[role=status]");
const dialog = (page: Page) => page.locator("dialog[open]");
/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

test("khách hàng: hồ sơ từ đơn thật, dữ liệu cá nhân che bớt, ghi chú, điều chỉnh điểm, khoá tài khoản có Hoàn tác", async ({
  page,
}) => {
  await signIn(page, "/customers");
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 47").first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: "Customers" }),
  ).toBeVisible();

  await page.getByLabel("Find a customer").fill("nguyen thi hoa");
  // Lọc tự chạy khi ngừng gõ, không cần bấm nút.
  await expect(page).toHaveURL(/q=nguyen/);
  await page.getByRole("link", { name: "Nguyễn Thị Hoa" }).click();
  await expect(page.getByRole("link", { name: "BM-2611-0412" })).toBeVisible();
  await expect(page.getByText(/^09•• ••• \d{3}$/).first()).toBeVisible();
  await expect(page.getByText("n•••@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Add note" }).click();
  await dialog(page).getByRole("button", { name: "Save note" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByLabel("Note").fill("Khách hỏi bảo hành nắp chảo.");
  await dialog(page).getByRole("button", { name: "Save note" }).click();
  await expect(toast(page)).toContainText("Note saved.");
  await expect(page.getByText("Khách hỏi bảo hành nắp chảo.")).toBeVisible();

  // Điều chỉnh điểm: mọi lỗi báo một lần dưới từng ô.
  await page.getByRole("button", { name: "Adjust points" }).click();
  await expect(dialog(page)).toContainText("append-only");
  await dialog(page)
    .getByLabel(/^Points/)
    .fill("0");
  await dialog(page).getByLabel("Reference").fill("x");
  await dialog(page).getByRole("button", { name: "Adjust" }).click();
  await expect(
    dialog(page).getByText("Enter a whole number other than 0, e.g. +200."),
  ).toBeVisible();
  await expect(dialog(page).getByText("4–40 letters, digits or dashes.")).toBeVisible();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page)
    .getByLabel(/^Points/)
    .fill("+120");
  await dialog(page).getByLabel("Reference").fill("CSKH-E2E-001");
  await dialog(page).getByLabel("Reason").fill("Bù điểm đơn tích thiếu");
  await dialog(page).getByRole("button", { name: "Adjust" }).click();
  await expect(toast(page)).toContainText("Points adjusted.");

  // Đăng ký tại quầy: SĐT sai báo dưới ô.
  await page.getByRole("button", { name: "Add customer at counter" }).click();
  await dialog(page).getByLabel("Phone number").fill("123");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(
    dialog(page).getByText("Enter a Vietnamese mobile number such as 09xx xxx xxx."),
  ).toBeVisible();
  await dialog(page).getByLabel("Phone number").fill("0909 555 777");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(toast(page)).toContainText("Profile created.");

  // Tài khoản người mua: khoá rồi Hoàn tác.
  await page.goto("/customers/accounts?chip=active");
  await page.getByRole("button", { name: "Lock" }).first().click();
  await expect(toast(page)).toContainText("Locked; every session of this person was revoked.");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");

  // Nhóm: xem trước số khớp không lưu gì.
  await page.goto("/customers/segments");
  await page.getByRole("button", { name: "Preview matches" }).click();
  await expect(page.getByRole("status").filter({ hasText: /profiles match/ })).toBeVisible();

  // Rủi ro COD: gỡ chặn rồi Hoàn tác.
  await page.goto("/customers/cod");
  await page.getByRole("button", { name: "Lift block" }).first().click();
  await expect(toast(page)).toContainText("Block lifted");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");

  // Giỏ bỏ dở: danh sách nằm ở màn Đơn hàng.
  await page.goto("/customers/carts");
  await page.getByRole("link", { name: "Open abandoned carts" }).click();
  await expect(page).toHaveURL(/\/sales\/orders\/carts$/);
});

test("kênh bán: tạm dừng có Hoàn tác, khoá sai báo dưới ô, gắn dòng thiếu ánh xạ nhập thành đơn, đối soát rồi ghi sổ", async ({
  page,
}) => {
  await signIn(page, "/sales/channels");
  await expect(page.getByRole("heading", { level: 1, name: "Sales channels" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 48").first()).toBeVisible();
  const sub = page.getByRole("navigation", { name: "Sales", exact: true });
  // Màn có việc đang chờ mang số đếm cạnh tên (W-020).
  await expect(sub.getByRole("link")).toHaveText([
    /^Orders\s*\d*$/,
    /^Shipping\s*\d*$/,
    "Stores",
    "Sales channels",
  ]);

  await page.getByRole("button", { name: "Pause" }).first().click();
  await expect(toast(page)).toContainText("Paused");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone.");

  // Khoá kết nối: ô mật khẩu, kênh từ chối khoá ngắn (báo dưới ô), không điền lại khoá.
  await page.getByRole("button", { name: "Connect a channel" }).click();
  await dialog(page).getByLabel("Account name").fill("Bếp Mộc Thử");
  await dialog(page).getByLabel("Connection key").fill("abc");
  await dialog(page).getByRole("button", { name: "Connect" }).click();
  await expect(dialog(page).getByText(/The channel rejected this key/)).toBeVisible();
  await expect(dialog(page).getByLabel("Connection key")).toHaveValue("");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // Đơn cần xử lý: gắn dòng KB4-BE với biến thể rồi nhập thành đơn.
  await page.goto("/sales/channels/inbound?chip=needs_mapping");
  await page
    .getByRole("row", { name: /KB4-BE/ })
    .getByRole("link")
    .click();
  await page.getByRole("button", { name: "Link KB4-BE" }).click();
  await dialog(page).getByLabel("Catalog variant").selectOption("KB4-BE");
  await dialog(page).getByRole("button", { name: "Link and import" }).click();
  await expect(toast(page)).toContainText("Link saved");
  await page.goto("/sales/channels/inbound?chip=needs_mapping");
  await expect(page.getByRole("row", { name: /KB4-BE/ })).toHaveCount(0);

  // Đối soát: đóng hai dòng lệch (ghi chú bắt buộc), rồi ghi sổ qua hộp xác nhận.
  await page.goto("/sales/channels/settlements");
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole("button", { name: "Mark resolved" }).first().click();
    await dialog(page).getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
    await dialog(page).getByLabel("Note").fill("Đã liên hệ kênh");
    await dialog(page).getByRole("button", { name: "Mark resolved" }).click();
    await expect(toast(page)).toContainText("Mismatch closed.");
  }
  await page
    .getByRole("row", { name: /Matched/ })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: "Post to ledger" }).click();
  await expect(dialog(page)).toContainText("This cannot be undone");
  await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Post", exact: true }).click();
  await expect(toast(page)).toContainText("Statement posted to the ledger.");
});

test("tiếp thị liên kết: duyệt, thiếu xác thực, quy tắc không hiệu lực trong quá khứ, chi trả có xác nhận, bắt đầu livestream", async ({
  page,
}) => {
  await signIn(page, "/marketing/affiliate");
  await expect(page.getByRole("heading", { level: 1, name: "Affiliate marketing" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 49").first()).toBeVisible();
  await expect(page.getByText(/E-commerce Law 122\/2025\/QH15/)).toBeVisible();

  await page.goto("/marketing/affiliate?chip=pending_verification");
  await page.getByRole("link", { name: "Tuấn Ăn Gì" }).click();
  await expect(page.getByText("Still missing: phone verification.")).toBeVisible();

  await page.goto("/marketing/affiliate?chip=pending_review");
  await page.getByRole("link", { name: "Mẹ Bơ Review" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(toast(page)).toContainText("Mẹ Bơ Review approved");

  // Quy tắc hoa hồng: chưa chọn danh mục và ngày hôm nay đều báo dưới ô, một lần.
  await page.goto("/marketing/affiliate/rules");
  await page.getByRole("button", { name: "Add commission rule" }).click();
  await dialog(page).getByLabel("Rate (%)").fill("8");
  await dialog(page).getByLabel("Effective from").fill(today());
  await dialog(page).getByRole("button", { name: "Add rule" }).click();
  await expect(dialog(page).getByText("Choose a date from tomorrow.")).toBeVisible();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /commission/ })).toBeVisible();

  // Chi trả: đánh dấu đã chi tay nêu số tiền, thuế, "không hoàn tác được"; mã giao dịch bắt buộc.
  await page.goto("/marketing/affiliate/payouts");
  await page.getByRole("button", { name: "Mark paid manually" }).click();
  await expect(dialog(page)).toContainText("This cannot be undone.");
  await dialog(page).getByRole("button", { name: "Record as paid" }).click();
  await expect(dialog(page).getByText("Fill in this field.")).toBeVisible();
  await dialog(page).getByLabel("Bank transaction code").fill("GD-E2E-0001");
  await dialog(page).getByRole("button", { name: "Record as paid" }).click();
  await expect(toast(page)).toContainText("Recorded as paid");

  // Livestream: bắt đầu phiên đã lên lịch qua hộp xác nhận.
  await page.goto("/marketing/affiliate/live");
  await page.getByRole("link", { name: "Chảo gang cho bếp từ" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await dialog(page).getByRole("button", { name: "Start" }).click();
  await expect(toast(page)).toContainText("Session started");
});
