# Chỗ còn lệch bản thiết kế

File nội bộ, cho agent phiên sau. Đối chiếu ngày 16/11/2026 giữa hai bản thiết kế của chủ dự án
(artifact "Autoxide Admin — thiết kế quản trị", trang "Thiết kế 2"; artifact "Autoxide Web — website công khai",
trang "Thiết kế 2") và code. Chỗ đã cố ý khác thiết kế có quyết định W-xxx thì không ghi ở đây.

Cách làm (chủ dự án, 16/11): bám sát thiết kế; core chưa có API thì dựng bằng dữ liệu mẫu theo W-006 và ghi yêu cầu
cho core ở `docs/prompts/web-build-api-gaps.md` của core; core có API mới thì nối và bỏ mẫu. Làm xong dòng nào thì
đánh `[x]`. Ký hiệu công: S (dưới 1 giờ), M, L. "API" = core đã có endpoint; "mẫu" = dữ liệu mẫu.

## Đã gửi core

- Passkey: core đòi authenticator ép `credProtect` (`enforceCredentialProtectionPolicy: true`). Authenticator ảo của
  Chromium từ chối (`NotAllowedError`), bỏ phần mở rộng này thì tạo được. Cần thử trên thiết bị thật (Windows Hello,
  iCloud Keychain, Android); nếu thiết bị nào không hỗ trợ `credProtect` thì không thêm được passkey.
- `GET /auth/users` lọc theo `role_id` (số người giữ role, "Xem người giữ role").

## Trang quản trị

### Khung, đăng nhập, trạng thái chung

- [x] Góc trên trái hiện tên khách khi core nhiều khách (`GET /kernel/tenant`) — API (16/11)
- [x] Bộ chọn nút tổ chức ở góc trên trái — API (17/11, W-045); phần "khách hàng khác" chờ đợt 2 (`GET /auth/me/tenants`)
- [x] Đăng nhập bằng passkey ở `/login` (`POST /auth/login/passkey/options`, `/auth/login/passkey`) — API (16/11)
- [x] Thanh báo mất kết nối (16/11)
- [ ] `loading.tsx` (khung xám) cho các màn chính — S mỗi màn
- [x] Trang riêng thay cả khung khi khách bị tạm khoá (`403 tenant_suspended`) hay bảo trì / đang dời (`503 tenant_maintenance`) — API (16/11)
- [x] Bảng lệnh Ctrl K tìm cả dữ liệu (bài viết, media, người dùng) và nhóm "Tạo mới" — API (16/11)
- [ ] Chuông thông báo (Hộp thư / Đã lưu / Xong) — mẫu, M
- [ ] Trang tổng quan của từng phân hệ — mẫu, L
- [ ] Phân hệ "Báo cáo" (bán hàng, tồn kho và giá vốn, gộp cửa hàng, xuất dữ liệu) — mẫu, L
- [x] Thẻ gói và hạn mức trên Tổng quan — `/plans/entitlements`, `/plans/subscription` (W-049), S
- [x] Nhãn "Pro" cho tính năng của gói cao hơn — nhãn "Cần gói cao hơn" theo `features` của `/plans/entitlements` (W-049), M
- [ ] Thanh đáy điện thoại 5 mục (thêm Việc, Tìm) — S
- [ ] "Phân hệ chưa bật cho gói", trang "không có quyền" có nút "Gửi yêu cầu quyền" — mẫu, M
- [x] Màn nhận lời mời (`/invitation`: đặt mật khẩu hoặc bỏ trống để đăng nhập bằng link / passkey; đã có tài khoản thì đăng nhập rồi nhận) — API (17/11, W-046)

### Tài khoản, phân quyền, cài đặt, nhà phát triển

- [x] Nhân bản role — API (16/11)
- [ ] Số người giữ role, "Xem người giữ role" — cần core thêm `role_id` cho `GET /auth/users`, M
- [x] Lưới quyền (permission × độ sâu): ô độ sâu cạnh permission có phạm vi trong trình sửa role, cờ "bắt buộc MFA" — API (17/11, W-046)
- [x] Tài khoản: "Nơi bạn làm việc" (`GET /auth/me/memberships`, `GET /auth/me/tenants`) — API (17/11, W-046); tên nút chỉ hiện khi đọc được cây (core chưa trả tên kèm membership)
- [ ] Tài khoản: ngôn ngữ ưa thích nhớ theo tài khoản (`PUT /me/flags/{key}`) — API, S
- [ ] Nhật ký request: chi tiết một dòng (Request ID, Idempotency-Key, trace) — mẫu, S
- [ ] Nhà phát triển: tab "Job lỗi" dùng lại bảng của Cài đặt › Job — mẫu, S
- [ ] Job: "Tải file", "Chạy ngay" — mẫu (bước 52), S
- [ ] Gói: "Trả tiền", "Tải hoá đơn" ở kỳ thanh toán — core chưa có cổng thanh toán và hoá đơn cho kỳ (bước 35 chỉ ghi kỳ), S–M
- [ ] Module theo khách (nguồn: gói / gói thêm / ghi đè, khoá, "Đổi gói") — API có (`/plans/entitlements`), chưa nối (đợt 3b), M
- [ ] Tuân thủ: "Xuất bộ hồ sơ" mọi website — mẫu, S
- [ ] Pháp lý › Vụ việc: bước "Chấp nhận phản ánh" — mẫu, S

### Nội dung, tiếp thị

- [x] Danh sách bài: nút "Duyệt và đăng" trên dòng chờ duyệt (`POST /content/entries/{id}/publish`) — API (16/11)
- [x] Hộp Đăng bài: danh sách kiểm trước khi đăng (gom từ `seo-check` của core) — API (16/11)
- [ ] Trình soạn: xem trước theo khổ máy — S–M
- [x] Menu: xem khác biệt khi lưu bị 412 (bản của họ / bản của bạn / mục trùng) — API (16/11)
- [x] Bản tin: dải số tổng — đã có ở tab Danh sách (cộng `subscriptions` của `GET /newsletter/lists`)
- [ ] Media: "Đang dùng ở" (cần core), lọc thiếu alt theo ngôn ngữ — M / S
- [x] Menu: chọn website — theo bộ chọn nút góc trên trái (menu của từng website, D-305 của core) — API (17/11, W-045)
- [ ] Khối "Nhúng sản phẩm" trong bài — chờ bước 51

### Thương mại (toàn bộ là mẫu)

- [ ] Trung tâm người bán: "Thêm sản phẩm" — M
- [ ] Vận chuyển: "In nhãn" vận đơn; "Bỏ ghi đè" phương thức giao — M / S
- [ ] Hoá đơn điện tử: tải PDF / XML, xem trước bản in — M
- [ ] Nhập CSV sản phẩm: tải file dòng lỗi, nhập lại dòng đã sửa — S–M
- [ ] Sổ biến động kho: xuất CSV, ghi điều chỉnh ngược, xem ảnh; kiểm kê nhập từ CSV; lô "Tạo khuyến mại xả lô" — M
- [ ] Đơn hàng: chọn cột, mật độ, sao chép liên kết (thành component chung cho mọi bảng) — M
- [ ] Tài chính: lịch sử hồ sơ thuế; sai lệch: nhắn người mua, xem giao dịch ngân hàng — S–M
- [ ] Cửa hàng: chip lọc hàng đợi nhận tại quầy theo cửa hàng — S
- [ ] Khách hàng: xuất CSV, thêm hồ sơ vào nhóm, huỷ nhắc giỏ — S mỗi nút
- [ ] Kênh bán: đổi kỳ và xuất CSV báo cáo; kéo sản phẩm có sẵn, gia hạn giữ, chọn sản phẩm khác, xem dữ liệu gốc — S mỗi nút
- [ ] Tiếp thị liên kết: kiểm trạng thái lệnh chi; tải bảng tổng hợp năm — S

## Website bán hàng (toàn bộ là mẫu, trừ ghi khác)

- [x] Tài khoản người mua: thêm Tải hàng số, Bảo hành, Tranh chấp (bằng chứng, nhờ sàn, rút), Đăng nhập và bảo mật — mẫu (16/11, W-044)
- [ ] Tài khoản › Bảo mật: đổi số điện thoại, thêm passkey cho người mua — chờ bước 47
- [ ] Tài khoản: hộp Đánh giá đơn, Mua lại, Đã nhận hàng, tải hoá đơn, nhắn người bán; đổi trả 3 bước có ảnh — M–L
- [ ] Thanh toán: mã người tiếp thị; trả góp qua công ty tài chính; giỏ chỉ có hàng số — M mỗi việc
- [ ] Trang đặt xong và tra cứu đơn: tạo tài khoản tại chỗ bằng mã 6 số; tra cứu: huỷ đơn chưa giao — S–M
- [ ] Gian hàng: lọc / sắp xếp đánh giá, "Có ảnh"; form báo vi phạm; chỉ số huỷ do người bán — M
- [ ] Nút ⓘ giải thích: cách nhận hàng, cách thanh toán, hoá đơn công ty, Chợ là gì, người bán tin cậy — S
- [ ] Thẻ sản phẩm chèn giữa bài viết — chờ bước 51
- [ ] Thân riêng ba trang chiến dịch — chờ bước 67 (W-029)
