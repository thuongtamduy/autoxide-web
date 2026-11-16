# Sổ nợ của backend (core) với giao diện

File nội bộ: những gì giao diện đã **gửi yêu cầu** cho team core mà core **chưa làm**, để nhắc lại đúng lúc.
Danh sách chi tiết từng dòng nằm ở core: [`docs/prompts/web-build-api-gaps.md`](https://github.com/thuongtamduy/autoxide/blob/main/docs/prompts/web-build-api-gaps.md)
(dòng `[ ]` là còn nợ). File này chỉ giữ phần tóm tắt, lần gửi và cách nhắc; không chép lại từng dòng.

Cập nhật file này mỗi khi gửi đợt yêu cầu mới, khi core làm xong một phần, hoặc khi đã nhắc.

## Các lần gửi

| Ngày | Gửi bằng | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 15/11/2026 | [thuongtamduy/autoxide#50](https://github.com/thuongtamduy/autoxide/pull/50) | Đề bài A–D (`docs/prompts/web-api-requests.md`): sửa chỗ chưa phù hợp, trường và bộ lọc thiếu, cấu hình cho giao diện, tài khoản và API key | **Core đã làm xong** (merge #51, 16/11); giao diện đã nối (W-027, W-028) |
| 16/11/2026 | [thuongtamduy/autoxide#52](https://github.com/thuongtamduy/autoxide/pull/52) | Đợt 2: 4 chỗ core trả khác OpenAPI; ~20 thứ website bán hàng cần | **Đã merge vào `main`, core chưa làm** — chủ dự án quyết để đó, nhắc sau |

## Còn nợ (đếm ngày 16/11/2026)

279 dòng `[ ]` trong bảng của core. Chia hai loại, nhắc khác nhau:

- **170 dòng đã có bước trong lộ trình** (33–52): core sẽ làm khi tới bước đó. Không cần nhắc riêng; chỉ cần
  nhắc team core **đọc mục tương ứng của bảng khi viết đặc tả bước** (bảng ở mục E của `web-api-requests.md`).
- **109 dòng "mới"** (chưa nằm trong bước nào): dễ bị quên nhất, phải nhắc. Nhiều nhất ở: Sản phẩm (15), Website
  bán hàng (14), Cây tổ chức và Tuân thủ (13), Mặt điều khiển nền tảng (13), Khuyến mại và Vận chuyển (11), Khách
  hàng / Kênh bán / Tiếp thị liên kết (10), Tài chính (9).

### Nhắc trước (nhỏ, làm được ngay trên module đã có)

1. **4 chỗ core trả khác mô tả OpenAPI** (mục "Core trả khác mô tả OpenAPI"): `LastDelivery.status`
   (`succeeded`/`delivered`), `Location` của `POST /kernel/tenants` thiếu `/api/v1`, `content.post_path_prefix`
   (`blog`/`/blog/`), mô tả `CommentDetail.target_title`. Giao diện đã chịu cả hai dạng, nên không gấp, nhưng
   hợp đồng phải khớp.
2. **Danh sách danh mục và thẻ công khai của `content`** (website `/blog` đang gom chủ đề từ trang đang xem).
3. **Endpoint công khai cho đơn vị hành chính** của module `address` (website đặt hàng đang dùng dữ liệu mẫu).
4. **`reason` khi tạm khoá khách** (`PATCH /kernel/tenants/{id}`) để ghi audit.
5. **Ngôn ngữ của menu** (`AUTOXIDE_MENUS_LOCALES`) và **danh sách loại đối tượng** cho menu (sổ đối tượng).

### Nhắc khi core tới bước

- Bước 34: hồ sơ công khai của khách (website cần tên, thông tin pháp lý, logo Bộ Công Thương), role theo nút.
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
  (đã merge ở #52). Làm trước 5 mục nhỏ ở phần "Nhắc trước".
- Khi viết đặc tả bước tiếp theo, đọc mục tương ứng của bảng để thêm ngay từ đầu.
Làm xong dòng nào thì đánh [x] ở dòng đó.
```
