# Sổ nợ của backend (core) với giao diện

File nội bộ: những gì giao diện đã **gửi yêu cầu** cho team core mà core **chưa làm**, để nhắc lại đúng lúc.
Danh sách chi tiết từng dòng nằm ở core: [`docs/prompts/web-build-api-gaps.md`](https://github.com/thuongtamduy/autoxide/blob/main/docs/prompts/web-build-api-gaps.md)
(dòng `[ ]` là còn nợ). File này chỉ giữ phần tóm tắt, lần gửi và cách nhắc; không chép lại từng dòng.

Cập nhật file này mỗi khi gửi đợt yêu cầu mới, khi core làm xong một phần, hoặc khi đã nhắc.

## Các lần gửi

| Ngày       | Gửi bằng                                                                     | Nội dung                                                                                                                                                                                                             | Trạng thái                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 15/11/2026 | [thuongtamduy/autoxide#50](https://github.com/thuongtamduy/autoxide/pull/50) | Đề bài A–D (`docs/prompts/web-api-requests.md`): sửa chỗ chưa phù hợp, trường và bộ lọc thiếu, cấu hình cho giao diện, tài khoản và API key                                                                          | **Core đã làm xong** (merge #51, 16/11); giao diện đã nối (W-027, W-028)                                                            |
| 16/11/2026 | [thuongtamduy/autoxide#52](https://github.com/thuongtamduy/autoxide/pull/52) | Đợt 2: 4 chỗ core trả khác OpenAPI; ~20 thứ website bán hàng cần                                                                                                                                                     | **Core làm một phần** (#53, 16/11): 4 chỗ OpenAPI, chủ đề công khai; còn lại đã xếp vào bước của lộ trình. Giao diện đã nối (W-033) |
| 16/11/2026 | [thuongtamduy/autoxide#54](https://github.com/thuongtamduy/autoxide/pull/54) | Giao diện đã nối bước 33 phần C và D-296; 6 chỗ mô tả OpenAPI chưa khớp (nhỏ)                                                                                                                                        | **Đã merge vào `main`, core chưa sửa** — không gấp, giao diện chịu được cả hai dạng                                                 |
| 16/11/2026 | [thuongtamduy/autoxide#57](https://github.com/thuongtamduy/autoxide/pull/57) | Chạy thử với core thật: 2 chỗ core trả khác mô tả OpenAPI (mã chọn khách `tenant_required` / `tenant_not_found` chưa ở "Conventions"; thiếu tham số query bắt buộc trả `400 bad_request` thay vì `422`)              | Đã gửi; không gấp, giao diện chịu được cả hai                                                                                       |
| 17/11/2026 | [thuongtamduy/autoxide#66](https://github.com/thuongtamduy/autoxide/pull/66) | Đã nối bước 34 đợt 1 (W-045); 3 yêu cầu mới: hồ sơ công khai của website đang được gọi (kèm pháp lý, logo), số người ở mỗi nút, dạng giá trị của cài đặt; tham số `inherited` chưa có mô tả OpenAPI                  | Đã gửi; không gấp                                                                                                                   |
| 17/11/2026 | [thuongtamduy/autoxide#68](https://github.com/thuongtamduy/autoxide/pull/68) | Đã nối bước 34 đợt 2 (W-046); 4 yêu cầu mới: tên nút trong `GET /auth/me/memberships`, danh sách khách con cho khách cha, `auth.login_link` trong client-config, tên nhân sự nền tảng trong lần cấp quyền vào hỗ trợ | Đã gửi; không gấp                                                                                                                   |
| 17/11/2026 | [thuongtamduy/autoxide#71](https://github.com/thuongtamduy/autoxide/pull/71) | Đã nối bước 35 đợt 3a (W-047); còn thiếu: `billing-profile`, kỳ thanh toán theo khách cho nhân sự nền tảng, `subscriber_count`, danh sách ghi đè của mọi khách                                                       | Đã gửi; không gấp                                                                                                                   |
| 17/11/2026 | [thuongtamduy/autoxide#73](https://github.com/thuongtamduy/autoxide/pull/73) | Đã nối bước 35 đợt 3b (W-049); còn thiếu: `expand=subscription,usage` luôn `null`, `support-grants` bắt buộc `tenant_id`, trần giờ hỗ trợ, khách tắt hỗ trợ, tên gói trong thuê bao                                  | Đã gửi; không gấp                                                                                                                   |
| 17/11/2026 | [thuongtamduy/autoxide#75](https://github.com/thuongtamduy/autoxide/pull/75) | Đã dùng các API của D-331 – D-334 (W-050); không có yêu cầu mới                                                                                                                                                      | Đã gửi                                                                                                                              |
| 17/11/2026 | [thuongtamduy/autoxide#76](https://github.com/thuongtamduy/autoxide/pull/76) | Đã nối chuyển khách (W-051); xin quyền của người dùng ở khách đang vào (`GET /auth/me` trả 401 ở đó)                                                                                                                 | Đã gửi; cần nhất                                                                                                                    |
| 17/11/2026 | [thuongtamduy/autoxide#78](https://github.com/thuongtamduy/autoxide/pull/78) | Quầy bán làm lại (W-053): mã giảm giá và khách khi bán tại quầy, tiền khách đưa / tiền thối, tạm tính giỏ và tìm khách bằng quyền bán tại quầy, mã vạch và nhóm hàng trong danh mục quầy                             | Đã gửi; không gấp (bước 45)                                                                                                         |

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

Đã xong (17/11, core D-331 – D-334) và giao diện đã dùng (W-050): số người mỗi nút, dạng giá trị của cài đặt theo
nút, hồ sơ của website đang được gọi, tên nút trong membership, khách cấp dưới, `auth` trong client-config, migrate
placement bằng API, số người giữ role, `reason` khi sửa khách.

1. **Danh sách loại đối tượng** cho menu (sổ đối tượng).
2. **Hồ sơ công khai cho website** (gặp khi nối W-045, 17/11): logo và thông tin pháp lý — core quyết để ở
   `compliance` (bước 37) và "Thông tin cửa hàng công khai" (bước 68), D-331. Hồ sơ của website đang được gọi **đã có**
   (`GET /organizations/public/site`, D-331) và **đã dùng** (W-050).
3. **Gặp khi nối đợt 2 (17/11, W-046):** **đã có cả ba** (D-333) và **đã dùng** (W-050): tên nút trong membership,
   danh sách khách cấp dưới, `auth` trong client-config.
4. **Gặp khi nối bước 35 (17/11, W-047):** **đã có cả ba** (D-335) và **đã dùng** (W-054): kỳ thanh toán của một khách
   cho nhân sự nền tảng, danh sách ghi đè của mọi khách, `subscriber_count`.
5. **Gặp khi nối bước 35 đợt 3b (17/11, W-049):** **đã có cả năm** (D-335) và **đã dùng** (W-054): `expand`
   thuê bao / hạn mức, danh sách lần cấp không cần `tenant_id`, trần thời hạn trong client-config, `…/allowed`, tên gói
   trong thuê bao.
6. **Gặp khi nối chuyển khách (17/11, W-051):** **đã có** (D-339) và **đã dùng** (W-054): `GET /auth/me` ở khách đang
   vào trả quyền ở đó.
7. **Mô tả OpenAPI chưa khớp** (17/11): tham số `inherited` của `GET /auth/memberships` — **đã có mô tả** (D-332).

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
