import { expect, test } from "@playwright/test";
import { CORE, expectMoneyOnOneLine, expectNoHorizontalScroll } from "./helpers";

// Trang của người mua và của sàn (W-030): giỏ → đặt hàng (lỗi gom một lần, đặt một lần dù bấm hai lần)
// → đặt xong; tra cứu đơn; tài khoản; gian hàng; mời bán hàng (biểu mẫu thật của core và form mẫu).

const BASE = "http://localhost:3200";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__storefront/reset`);
});

test("giỏ chia theo nơi bán → đặt hàng có lỗi → đặt xong, hai đơn", async ({ page }) => {
  await page.goto("/");
  await page.locator(".pcard", { hasText: "Bộ dao bếp 3 món" }).hover();
  await page.getByRole("button", { name: "Thêm Bộ dao bếp 3 món vào giỏ" }).click();
  await expect(page.locator(".hdr-cart")).toHaveAccessibleName("Giỏ hàng, 1 món");
  await page.goto("/nguoi-ban/gom-su-bat-trang-xua");
  await page.locator(".pcard", { hasText: "Đĩa men rạn 26 cm" }).hover();
  await page.getByRole("button", { name: "Thêm Đĩa men rạn 26 cm vào giỏ" }).click();
  await expect(page.locator(".hdr-cart")).toHaveAccessibleName("Giỏ hàng, 2 món");

  await page.goto("/gio-hang");
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  // Trang khép kín: không ô tìm, có "Cần giúp?" trỏ tới tra cứu đơn.
  await expect(page.locator(".hdr-search")).toBeHidden();
  await page.getByRole("button", { name: "Cần giúp?" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Cần giúp đặt hàng?" })
      .getByRole("link", { name: /Tra cứu đơn hàng/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Bếp Mộc bán và giao" })).toContainText(
    "Bộ dao bếp 3 món",
  );
  await expect(page.getByRole("region", { name: "Gốm Sứ Bát Tràng Xưa" })).toContainText(
    "Đĩa men rạn 26 cm",
  );
  await page.getByRole("button", { name: "Thêm một Đĩa men rạn 26 cm" }).click();
  await expect(page.locator(".hdr-cart")).toHaveAccessibleName("Giỏ hàng, 3 món");
  // Mã giảm: mã lạ bị từ chối kèm lý do; BEPMOC10 chưa áp được vì giỏ chưa có chảo gang.
  await page.getByLabel("Nhập mã khác").fill("KHONGCO");
  await page.getByRole("button", { name: "Áp dụng" }).last().click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Mã “KHONGCO” không tồn tại hoặc đã hết hạn.",
  );
  await expect(page.locator(".co-offer")).toContainText("Giỏ chưa có chảo gang");
  await expect(page.locator(".by-sum")).toContainText("Phí giao của Gốm Sứ Bát Tràng Xưa");
  await expect(page.locator(".by-sum")).toContainText("tách thành 2 đơn");
  await page.getByRole("link", { name: "Tiếp tục đặt hàng" }).first().click();

  await expect(page).toHaveURL(/\/thanh-toan$/);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("main").getByRole("alert").first()).toHaveText(
    "Còn 5 chỗ cần sửa trước khi tiếp tục.",
  );
  await expect(page.getByLabel("Họ tên")).toBeFocused();
  await expect(page.getByText("Hãy chọn phường, xã.")).toBeVisible();
  await page.getByLabel("Họ tên").fill("Khách Mẫu");
  await page.getByLabel("Số điện thoại").fill("0912 345 678");
  await page.getByLabel("Tỉnh, thành phố").selectOption("01");
  await page.getByLabel("Phường, xã").selectOption("01-03");
  await page.getByLabel("Số nhà, tên đường").fill("[Số nhà mẫu]");
  // Hà Nội, bán từ CN Quận 3: 40.000 ₫ (Bộ dao 1,1 kg).
  await expect(page.locator(".co-sum")).toContainText("40.000 ₫");
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thanh toán");
  // Người bán không nhận COD: lựa chọn tắt, có lý do.
  await expect(page.getByRole("radio", { name: /Trả tiền khi nhận hàng/ })).toBeDisabled();
  const place = page.getByRole("button", { name: /^Đặt hàng · / });
  await place.click();
  await expect(page.getByRole("main").getByRole("alert").first()).toHaveText(
    "Còn 2 chỗ cần sửa trước khi tiếp tục.",
  );
  await page.getByText("Chuyển khoản QR (VietQR)").click();
  await page.getByText(/Tôi đồng ý với Điều khoản sử dụng/).click();
  // Bấm hai lần liền: vẫn một lần đặt (nút khoá khi đang gửi, máy chủ giữ Idempotency-Key).
  await place.dblclick();

  await expect(page).toHaveURL(/\/thanh-toan\/xong\?ma=/);
  await expect(page.getByRole("heading", { name: /Đặt hàng thành công/ })).toBeVisible();
  await expect(page.locator(".pl-order")).toHaveCount(2);
  await expect(page.locator(".pl-order").first()).toContainText("Bếp Mộc");
  await expect(page.locator(".pl-order").last()).toContainText("Gốm Sứ Bát Tràng Xưa");
  await expect(page.locator(".pl-pay")).toContainText("Đang chờ tiền về");
  await expect(page.locator(".hdr-cart")).toHaveAccessibleName("Giỏ hàng");
  const numbers = await page.locator(".pl-order .by-order-no").allTextContents();
  expect(numbers).toHaveLength(2);
  expect(numbers[0]).toMatch(/^BM-\d{4}-\d{4}$/);
  // Mẫu: báo đã chuyển → mọi đơn của lần thanh toán đã xác nhận.
  await page.getByRole("button", { name: "Tôi đã chuyển (mẫu)" }).click();
  await expect(page.locator(".pl-pay")).toContainText("Đã nhận tiền");
  await expect(page.locator(".pl-order .badge", { hasText: "Đã xác nhận" })).toHaveCount(2);

  // Tra cứu đơn vừa đặt bằng mã đơn và số điện thoại.
  await page.goto("/tra-cuu-don-hang");
  await page.getByLabel("Mã đơn hàng").fill(numbers[1] ?? "");
  await page.getByLabel("Số điện thoại đặt hàng").fill("0912345678");
  await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();
  await page.getByLabel("Mã xác nhận").fill("246810");
  await page.getByRole("button", { name: "Xem đơn" }).click();
  await expect(page.locator(".lk-card")).toContainText(numbers[1] ?? "");
  await expect(page.locator(".lk-card")).toContainText("091•••5678");
});

test("tra cứu đơn không cần tài khoản: lỗi theo ô, mã sai, rồi xem mốc giao", async ({ page }) => {
  await page.goto("/tra-cuu-don-hang");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tra cứu đơn hàng");
  await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();
  await expect(page.getByText(/Mã đơn có dạng BM-2611-0424/)).toBeVisible();
  await expect(page.getByText(/Số điện thoại cần 10 chữ số/)).toBeVisible();
  await page.getByLabel("Mã đơn hàng").fill("bm-2611-0421");
  await page.getByLabel("Số điện thoại đặt hàng").fill("0901234567");
  await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText("090•••4567");
  await page.getByLabel("Mã xác nhận").fill("111111");
  await page.getByRole("button", { name: "Xem đơn" }).click();
  await expect(page.getByText(/Còn 4 lần thử/)).toBeVisible();
  await page.getByLabel("Mã xác nhận").fill("246810");
  await page.getByRole("button", { name: "Xem đơn" }).click();
  const card = page.locator(".lk-card");
  await expect(card).toContainText("BM-2611-0421");
  await expect(card.locator(".badge")).toHaveText("Đang giao");
  await expect(card.locator('[aria-current="step"]')).toContainText("Đang giao");
  await expect(card).toContainText("VTBM-26110421");
  // Không lộ số nhà khi chưa đăng nhập.
  await expect(card).not.toContainText("[Số nhà, đường mẫu]");
  await expectNoHorizontalScroll(page);
});

test("tài khoản: đăng nhập bằng mã, các mục, đổi trả có lỗi rồi gửi được", async ({ page }) => {
  await page.goto("/tai-khoan");
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await expect(page.getByText("Hãy nhập họ tên người nhận.")).toBeVisible();
  await expect(page.getByText("Hãy đồng ý điều khoản để tiếp tục.")).toBeVisible();
  await page.getByRole("button", { name: "Đăng nhập" }).first().click();
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await page.getByLabel("Mã xác nhận").fill("000000");
  await page.getByRole("button", { name: "Đăng nhập" }).last().click();
  await expect(page.getByText(/Mã chưa đúng/)).toBeVisible();
  await page.getByLabel("Mã xác nhận").fill("246810");
  await page.getByRole("button", { name: "Đăng nhập" }).last().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Xin chào, Lan Chi");

  const nav = page.getByRole("navigation", { name: "Mục tài khoản" });
  await expect(nav.getByRole("link", { name: "Đơn hàng" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".acx-order")).toHaveCount(5);
  // Đơn đã giao còn hạn đổi trả: mở form, gửi thiếu thì báo mọi lỗi một lần.
  const delivered = page.locator(".acx-order", { hasText: "BM-2611-0420" });
  await delivered.locator("summary").click();
  await delivered.getByRole("button", { name: /Yêu cầu đổi trả/ }).click();
  await delivered.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(delivered.getByRole("alert")).toHaveText("Còn 4 chỗ cần sửa trước khi tiếp tục.");
  await delivered.getByLabel(/Chảo gang/).check();
  await delivered.getByLabel("Lý do").selectOption("damaged");
  await delivered.getByLabel("Mô tả vấn đề").fill("Chảo bị nứt ở tay cầm khi mở hộp.");
  await delivered.getByLabel("Mang tới cửa hàng gần nhất").check();
  await delivered.getByRole("button", { name: "Gửi yêu cầu" }).click();
  // Máy chủ ghi yêu cầu, trang dựng lại: dòng hạn đổi trả thành "đã gửi, chờ duyệt".
  await expect(delivered).toContainText("Yêu cầu đổi trả đã gửi: chờ duyệt.");

  await nav.getByRole("link", { name: "Điểm và hạng" }).click();
  await expect(page.locator(".acx-points")).toContainText("1.240 điểm");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "31");
  await nav.getByRole("link", { name: "Đã lưu" }).click();
  await expect(page.locator(".acx-row", { hasText: "Chờ hàng" })).toContainText("Chảo gang");
  await nav.getByRole("link", { name: "Sổ địa chỉ" }).click();
  await page.getByRole("button", { name: "Thêm địa chỉ" }).click();
  await page.getByRole("button", { name: "Lưu địa chỉ" }).click();
  await expect(page.getByText("Hãy chọn tỉnh, thành phố.")).toBeVisible();
  await nav.getByRole("link", { name: "Quyền riêng tư" }).click();
  const sms = page.getByRole("switch", { name: "Nhận tin khuyến mại qua tin nhắn" });
  await expect(sms).toHaveAttribute("aria-checked", "false");
  await sms.click();
  await expect(sms).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Xoá tài khoản" }).click();
  await expect(page.locator(".acx-confirm")).toContainText("BM-2611-0424");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập bằng số điện thoại");
});

test("gian hàng người bán: thông tin pháp lý, mục đánh giá, gian hàng tạm ngừng", async ({
  page,
}) => {
  await page.goto("/nguoi-ban");
  await expect(page.locator(".sgrid > .card")).toHaveCount(3);
  await page
    .getByRole("link", { name: /Gốm Sứ Bát Tràng Xưa/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gốm Sứ Bát Tràng Xưa");
  const info = page.getByRole("region", { name: "Thông tin người bán" });
  await expect(info).toContainText("[MÃ SỐ THUẾ]");
  await expect(info).toContainText("Doanh nghiệp");
  await page
    .getByRole("navigation", { name: "Nhóm hàng" })
    .getByRole("link", { name: /Ấm chén/ })
    .click();
  await expect(page.locator(".by-pgrid .pcard")).toHaveCount(2);
  await page.getByRole("link", { name: /^Đánh giá/ }).click();
  await expect(page).toHaveURL(/tab=danh-gia/);
  await expect(page.locator(".sl-item").first()).toContainText("Đã mua");
  await page.goto("/nguoi-ban/gia-dung-nha-na");
  await expect(page.locator(".sl-paused")).toContainText("Gian hàng tạm ngừng nhận đơn");
  await expect(page.locator(".pcard .quick")).toHaveCount(0);
  // Người bán đã đăng ký nhưng chưa xác thực xong: gian hàng mở được, ghi "chưa mở bán".
  await page.goto("/nguoi-ban/bep-nha-tho");
  await expect(page.locator(".sl-paused")).toContainText("Gian hàng chưa mở bán");
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  await page.goto("/nguoi-ban/khan-bong-ha-long");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Khăn Bông Hạ Long");
  const missing = await page.goto("/nguoi-ban/khong-co");
  expect(missing?.status()).toBe(404);
});

test("bán trên sàn: form mẫu khi chưa có biểu mẫu, biểu mẫu thật của core khi có", async ({
  page,
  request,
}) => {
  await page.goto("/ban-tren-cho");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bán hàng trên Chợ Bếp Mộc");
  await expect(page.locator(".so-fees")).toContainText("6% (đã gồm GTGT)");
  await page.getByRole("button", { name: "Gửi đăng ký" }).click();
  await expect(page.getByText("Hãy chọn bạn là doanh nghiệp")).toBeVisible();
  await page.getByLabel("Email liên hệ").fill("xuong@example.com");
  await page.getByRole("button", { name: "Hộ kinh doanh" }).click();
  await page.getByLabel("Ngành hàng chính").fill("gốm sứ");
  await page.getByLabel(/Tôi đồng ý cho sàn dùng email/).check();
  await page.getByRole("button", { name: "Gửi đăng ký" }).click();
  await expect(page.getByRole("status")).toContainText("xuong@example.com");

  await request.post(`${CORE}/__storefront/sell-form`, { data: { enabled: true } });
  await page.goto("/ban-tren-cho");
  const form = page.locator(".so-form");
  await expect(form).toContainText("Đăng ký bán trên Chợ Bếp Mộc");
  await form.getByLabel("Email").fill("sai");
  await form.getByRole("button", { name: "Gửi đăng ký" }).click();
  await expect(form.getByText("Nhập một địa chỉ email.")).toBeVisible();
  await expect(form.getByRole("alert")).toHaveText("Một số trường chưa hợp lệ.");
  await form.getByLabel("Email").fill("xuong@example.com");
  await form.getByLabel("Hộ kinh doanh").check();
  await form.getByLabel("Ngành hàng").fill("gốm sứ");
  await form.getByLabel(/Tôi đồng ý cho sàn/).check();
  await form.getByRole("button", { name: "Gửi đăng ký" }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhận đăng ký");
});

test("tiếng Anh: giỏ, tài khoản, gian hàng", async ({ page, context }) => {
  await context.addCookies([{ name: "sf_cart", value: "CG26:1", url: BASE }]);
  await page.goto("/en/gio-hang");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cart");
  await expect(page.getByRole("region", { name: "Sold and delivered by Bếp Mộc" })).toBeVisible();
  await page.goto("/en/tai-khoan");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in with your phone");
  await page.goto("/en/nguoi-ban/gom-su-bat-trang-xua?tab=chinh-sach");
  await expect(
    page.getByRole("region", { name: "Policies" }).getByText("Returns within 7 days"),
  ).toBeVisible();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`bố cục trang người mua ở ${width}px`, async ({ page, context }) => {
    await context.addCookies([
      { name: "sf_cart", value: "CG26:1,TG35:1,GS-DIA26:2", url: BASE },
      { name: "sf_buyer", value: "sample", url: BASE },
    ]);
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/gio-hang",
      "/thanh-toan",
      "/tai-khoan",
      "/tai-khoan?muc=diem",
      "/tai-khoan?muc=dia-chi",
      "/tai-khoan?muc=quyen-rieng-tu",
      "/nguoi-ban/gom-su-bat-trang-xua?tab=danh-gia",
    ]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      await expectMoneyOnOneLine(page);
    }
    // Bước thanh toán (sau khi điền bước giao hàng).
    await page.goto("/thanh-toan");
    await page.getByLabel("Tỉnh, thành phố").selectOption("79");
    await page.getByLabel("Phường, xã").selectOption("79-01");
    await page.getByLabel("Số nhà, tên đường").fill("[Số nhà mẫu]");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thanh toán");
    await expectNoHorizontalScroll(page);
    await expectMoneyOnOneLine(page);
  });
}
