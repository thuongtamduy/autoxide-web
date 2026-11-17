# Sổ nợ của backend (core) với giao diện

File nội bộ: những gì giao diện đã **gửi yêu cầu** cho team core mà core **chưa làm**, để nhắc lại đúng lúc.
Danh sách chi tiết từng dòng nằm ở core: [`docs/prompts/web-build-api-gaps.md`](https://github.com/thuongtamduy/autoxide/blob/main/docs/prompts/web-build-api-gaps.md)
(dòng `[ ]` là còn nợ). File này chỉ giữ phần tóm tắt, lần gửi và cách nhắc; không chép lại từng dòng.

Cập nhật file này mỗi khi gửi đợt yêu cầu mới, khi core làm xong một phần, hoặc khi đã nhắc.

## Các lần gửi

| Ngày       | Gửi bằng                                                                     | Nội dung                                                                                                                                                                                                | Trạng thái                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 15/11/2026 | [thuongtamduy/autoxide#50](https://github.com/thuongtamduy/autoxide/pull/50) | Đề bài A–D (`docs/prompts/web-api-requests.md`): sửa chỗ chưa phù hợp, trường và bộ lọc thiếu, cấu hình cho giao diện, tài khoản và API key                                                             | **Core đã làm xong** (merge #51, 16/11); giao diện đã nối (W-027, W-028)                                                            |
| 16/11/2026 | [thuongtamduy/autoxide#52](https://github.com/thuongtamduy/autoxide/pull/52) | Đợt 2: 4 chỗ core trả khác OpenAPI; ~20 thứ website bán hàng cần                                                                                                                                        | **Core làm một phần** (#53, 16/11): 4 chỗ OpenAPI, chủ đề công khai; còn lại đã xếp vào bước của lộ trình. Giao diện đã nối (W-033) |
| 16/11/2026 | [thuongtamduy/autoxide#54](https://github.com/thuongtamduy/autoxide/pull/54) | Giao diện đã nối bước 33 phần C và D-296; 6 chỗ mô tả OpenAPI chưa khớp (nhỏ)                                                                                                                           | **Đã merge vào `main`, core chưa sửa** — không gấp, giao diện chịu được cả hai dạng                                                 |
| 16/11/2026 | [thuongtamduy/autoxide#57](https://github.com/thuongtamduy/autoxide/pull/57) | Chạy thử với core thật: 2 chỗ core trả khác mô tả OpenAPI (mã chọn khách `tenant_required` / `tenant_not_found` chưa ở "Conventions"; thiếu tham số query bắt buộc trả `400 bad_request` thay vì `422`) | Đã gửi; không gấp, giao diện chịu được cả hai                                                                                       |
| 17/11/2026 | [thuongtamduy/autoxide#66](https://github.com/thuongtamduy/autoxide/pull/66) | Đã nối bước 34 đợt 1 (W-045); 3 yêu cầu mới: hồ sơ công khai của website đang được gọi (kèm pháp lý, logo), số người ở mỗi nút, dạng giá trị của cài đặt; tham số `inherited` chưa có mô tả OpenAPI     | Đã gửi; không gấp                                                                                                                   |

## Còn nợ (đếm ngày 16/11/2026; bước 34, 35 đã xong ngày 17/11)

272 dòng `[ ]` trong bảng của core. Chia hai loại, nhắc khác nhau:

- **170 dòng đã có bước trong lộ trình** (33–52): core sẽ làm khi tới bước đó. Không cần nhắc riêng; chỉ cần
  nhắc team core **đọc mục tương ứng của bảng khi viết đặc tả bước** (bảng ở mục E của `web-api-requests.md`).
- **109 dòng "mới"** (chưa nằm trong bước nào): dễ bị quên nhất, phải nhắc. Nhiều nhất ở: Sản phẩm (15), Website
  bán hàng (14), Cây tổ chức và Tuân thủ (13), Mặt điều khiển nền tảng (13), Khuyến mại và Vận chuyển (11), Khách
  hàng / Kênh bán / Tiếp thị liên kết (10), Tài chính (9).

### Nhắc trước (nhỏ, làm được ngay trên module đã có)

Đã xong (16/11, core #53): 4 chỗ core trả khác mô tả OpenAPI; danh sách danh mục và thẻ công khai của `content`
(website `/blog` đã dùng). Bộ biểu tượng ngành hàng cho menu: core trả lời không cần đổi (giao diện tự ánh xạ).

Đã xong (bước 34, core `5b35b99`): đơn vị hành chính công khai của `address` (website chưa nối ô địa chỉ khi đặt
hàng: việc của web, `NEXT.md`); `reason` khi tạm khoá khách (bước 35 phần F).

1. **Danh sách loại đối tượng** cho menu (sổ đối tượng).
2. **Hồ sơ công khai cho website** (gặp khi nối W-045, 17/11): (a) thêm logo, thông tin pháp lý (tên doanh nghiệp, mã
   số, địa chỉ đăng ký, logo đã thông báo Bộ Công Thương) vào hồ sơ công khai; (b) một endpoint công khai trả hồ sơ
   của **website đang được gọi** (nút mà tên miền hay `?site=` chọn) — `GET /organizations/public/stores` chỉ liệt kê
   cửa hàng, nên tên miền gắn với một cửa hàng con vẫn hiện tên của nút gốc.
3. **Gặp khi nối đợt 2 (17/11, W-046):** (a) `GET /auth/me/memberships` chỉ có `org_id`: người không có
   `organizations.units.read` không biết tên nút mình làm việc — nên kèm tên nút; (b) khách cha chưa có danh sách khách
   con để chọn khi uỷ quyền (`GET /kernel/tenants?parent_id=` chỉ cho khách nền tảng); (c) `GET /kernel/client-config`
   nên nói đăng nhập bằng link có bật không (`auth.login_link`), để giao diện chỉ hiện link khi dùng được.
4. **Mô tả OpenAPI chưa khớp** (17/11): tham số `inherited` của `GET /auth/memberships` không có mô tả trong
   `openapi.json` (mã nguồn có: "với `org_id` và `inherited=true` thì tính cả membership ở nút trên"); thiếu nó thì
   người được gán ở nút cha không hiện ở nút con.

### Nhắc khi core tới bước

- Bước 41–46: phần thương mại công khai của website (catalog lọc theo người bán, thông tin theo biến thể, báo
  giá giỏ có điểm và cách trả theo người bán, `return_until`, phí sàn công khai, đăng nhập người mua bằng OTP).
- Bước 51: hộp việc, số đếm menu, số liệu tóm tắt có `definition`, sổ đối tượng, nhúng bản ghi trong nội dung.

## Không phải nợ của core (việc của người triển khai)

Biến môi trường đặt ở core khi triển khai: `AUTOXIDE_AUTH_EMAIL_CHANGE_REPORT_URL`,
`AUTOXIDE_NEWSLETTER_CONFIRM_URL`, `AUTOXIDE_HTTP_TRUSTED_PROXIES` (website sau reverse proxy).

## Mẫu tin nhắc

```
Team core ơi, nhắc nợ giao diện (sổ: autoxide-web docs/backend-debt.md):
- Đọc mục "Core trả khác mô tả OpenAPI" và "Website bán hàng" ở cuối docs/prompts/web-build-api-gaps.md
  (đã merge ở #52). Làm trước các mục nhỏ ở phần "Nhắc trước".
- Khi viết đặc tả bước tiếp theo, đọc mục tương ứng của bảng để thêm ngay từ đầu.
Làm xong dòng nào thì đánh [x] ở dòng đó.
```
