# Đang ở đâu, làm gì tiếp

File nội bộ cho agent phiên sau: trạng thái lúc dừng và việc kế tiếp. Cập nhật khi xong một đợt việc; quyết định
lâu dài vẫn ghi ở [`DECISIONS.md`](DECISIONS.md), nợ của core ở [`backend-debt.md`](backend-debt.md).

## Trạng thái (16/11/2026, đợt 5)

- Trang quản trị (`apps/admin`) và website bán hàng (`apps/storefront`) đã dựng đủ màn theo bản thiết kế. Phần core
  có API thì dùng API thật; phần chưa có dùng dữ liệu mẫu theo W-006 (nhãn "sample").
- SDK ghim core ở commit `fb3ba06` của `main` (bước 33 của core tới D-297: đa khách, tên miền riêng, dời khách, chỉ
  đọc, cấu hình theo khách, nhóm `connection`). Core `main` mới nhất (`f62f5a2`) chỉ thêm ghi chú tài liệu, OpenAPI
  không đổi: SDK không cần sinh lại. Quyết định mới nhất của repo này: W-042.
- Đã chạy thử với core thật (16/11, core nhiều khách trên SQLite, hai khách, hai tên miền): website chọn đúng cửa
  hàng theo tên miền (bài, sitemap, canonical, robots); tên miền lạ trả 404 (W-038, trước đó là 500). Trang quản trị
  khi khách chỉ đọc: dải báo hiện, lưu cài đặt và lưu bài bị từ chối với thông báo `tenant_read_only` của core.
- Đợt 3: core `main` (`10d6c49`) vẫn chỉ đổi ghi chú. Sitemap và RSS của tên miền lạ cũng 404 (W-039), đã thử với
  core thật. Sửa một test e2e chập chờn của media: nút lưu đặt thẳng trên trang khoá tới khi JavaScript chạy (W-040).
  Mục "Tự làm được" còn lại đều là việc để đó có lý do: phần lớn việc tiếp theo chờ core (bước 34).
- Đợt 5: chủ dự án gửi hai bản thiết kế (artifact trang quản trị và website; core chép vào `docs/design` của nó,
  D-301) và giao bám sát mà không chờ core. Sổ chỗ lệch: [`design-gaps.md`](design-gaps.md) — **việc chính của các
  đợt tới là làm hết sổ này**. Đã làm: trạng thái toàn khung, tên khách, đăng nhập bằng passkey, nhân bản role (W-042).
  Core `main` mới nhất `beabc25`: OpenAPI không đổi.
- Đợt 4: core `main` vẫn ở `10d6c49`. Rà mọi form: 8 form `onSubmit` đặt thẳng trên trang khoá nút gửi tới khi trang
  chạy JavaScript (W-041); thêm form mới loại này thì dùng `useHydrated()` và thêm trang vào `before-hydration.spec.ts`.
- Gate đầy đủ xanh ở commit cuối của đợt này.

## Bám core (việc lặp lại)

Core phát triển trên `main` của nó, không chờ bản phát hành (W-025). Mỗi khi core có commit mới:

1. Đọc quyết định mới (`docs/DECISIONS.md` của core) và so `docs/openapi.json` với bản đang ghim
   (`packages/sdk/openapi.json`): endpoint mới, schema đổi.
2. Đổi `CORE_VERSION` trong `packages/sdk/scripts/generate.mjs`, chạy `AUTOXIDE_OPENAPI=<file> pnpm sdk:generate`
   (hoặc để script tự tải), sửa commit tối thiểu trong `README.md` và `README.vi.md`.
3. Nối màn dùng API mới; phần mẫu tương ứng thì bỏ (không giữ mẫu cho thứ core đã có). Core giả trong
   `apps/admin/e2e/mock-*.ts` phải trả đúng hình dạng OpenAPI.
4. Chạy thử với core thật một lần, rồi `./gate.sh`.
5. Đánh dấu dòng đã nối ở `docs/prompts/web-build-api-gaps.md` của core; chỗ core trả khác mô tả OpenAPI ghi vào mục
   "Core trả khác mô tả OpenAPI" của file đó; cập nhật `backend-debt.md`.

## Việc kế tiếp

Chờ core (nối ngay khi có):

- **Bước 34** (cây tổ chức, hồ sơ công khai của khách): form gắn tên miền với nút (`PATCH /kernel/domains/{id}`, hiện
  core chỉ nhận `null`); tên, logo, thông tin pháp lý của cửa hàng trên website lấy theo khách thay cho
  `AUTOXIDE_STOREFRONT_NAME`; role theo nút; màn Tổ chức bỏ dữ liệu mẫu.
- **Bước 35** (gói, thuê bao): `expand=subscription,usage`, lọc `subscription_status` / `near_limit` ở sổ khách (hợp
  đồng đã có, core trả `null` / rỗng); màn Gói và giá, Thuê bao bỏ dữ liệu mẫu.
- **Bước 41–49** (thương mại): website và các màn Bán hàng, Sản phẩm, Sàn… bỏ dữ liệu mẫu theo từng module.
- **Bước 51**: `POST /kernel/settings/{name}/test` → gom cài đặt của một kết nối thành form có nút kiểm tra (W-037).

Tự làm được, chưa làm:

- **Sổ chỗ lệch thiết kế** [`design-gaps.md`](design-gaps.md): làm theo thứ tự của sổ (chỗ core có API trước, rồi
  chỗ dựng bằng mẫu). Bản thiết kế: artifact "Autoxide Admin — thiết kế quản trị" và "Autoxide Web — website công
  khai" (trang "Thiết kế 2"), cũng có trong `docs/design` của core.

- Website trả 404 cho địa chỉ core báo đã gỡ (410): App Router không trả được 410 từ trang; làm ở proxy thì thêm một
  lời gọi core mỗi lượt xem. Để đó tới khi cần.
- Nhắc team core 3 việc nhỏ ở `backend-debt.md` (tỉnh / phường công khai, `reason` khi tạm khoá khách, danh sách loại
  đối tượng cho menu) và các chỗ mô tả OpenAPI chưa khớp (đợt mới nhất: thuongtamduy/autoxide#57, đã merge).

## Mẹo chạy thử

- Thử nhiều tên miền trên máy không có DNS: thêm tên miền ở core (`POST /kernel/domains`), rồi đặt `status` của nó
  thành `verified` thẳng trong bảng `kernel_tenant_domains` của database chạy thử (chỉ máy thử; core tra TXT thật).
  Gọi website với `curl -H "Host: shop-a.test" localhost:<cổng>/…`; core cần `AUTOXIDE_HTTP_TRUSTED_PROXIES=127.0.0.1`.

- Core nhiều khách: `AUTOXIDE_TENANCY_MODE=multi` (cần `AUTOXIDE_SECRET_KEY`); tạo khách bằng
  `POST /kernel/tenants`, tạo người dùng của khách bằng `autoxide user create --tenant <slug> --admin …`. Đăng nhập
  trang quản trị: gõ slug vào ô "Không gian làm việc" (W-034).
- `next dev` chặn script khi mở bằng `127.0.0.1`: mở bằng `localhost`, nếu không nút bấm không chạy.
- Sau mỗi lần `./gate.sh`: xoá `.turbo` (cache phình rất nhanh). `next build` của gate làm `next dev` đang chạy trên
  cùng thư mục ngừng: bật lại sau gate.
- Hai gate không chạy cùng lúc trên một máy (e2e dùng chung cổng 4010, 3100, 4012, 3200–3203).
