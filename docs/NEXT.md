# Đang ở đâu, làm gì tiếp

File nội bộ cho agent phiên sau: trạng thái lúc dừng và việc kế tiếp. Cập nhật khi xong một đợt việc; quyết định
lâu dài vẫn ghi ở [`DECISIONS.md`](DECISIONS.md), nợ của core ở [`backend-debt.md`](backend-debt.md).

## Trạng thái (17/11/2026, đợt 13)

- Trang quản trị (`apps/admin`) và website bán hàng (`apps/storefront`) đã dựng đủ màn theo bản thiết kế. Phần core
  có API thì dùng API thật; phần chưa có dùng dữ liệu mẫu theo W-006 (nhãn "sample").
- SDK ghim core ở commit `1c2e4f4` của `main` (bước 34 cây tổ chức và danh tính, bước 35 gói và thuê bao, xuất dữ liệu
  một khách — D-303 tới D-334). Quyết định mới nhất của repo này: W-051.
- Đợt 8 (17/11): nối đợt 1 của bước 34 (W-045): màn Cây tổ chức thật, bộ chọn nút góc trên trái (lọc bài, media, form,
  menu theo nút), tab Hồ sơ công khai thật (địa chỉ theo danh mục hành chính của core), tên cửa hàng của website lấy
  từ hồ sơ công khai của nút gốc. Đã chạy thử với core thật.
- Đợt 9 (17/11): nối đợt 2 của bước 34 (W-046): role theo độ sâu và bắt buộc MFA (dải nhắc bật MFA), lời mời thật và
  trang nhận lời mời, đăng nhập bằng link qua email, uỷ quyền, quyền vào hỗ trợ phía khách, sửa hồ sơ (tên, ngôn ngữ,
  múi giờ), "Nơi bạn làm việc", role ở các nút khác gốc. Đã chạy thử với core thật.
- Đợt 10 (17/11): nối đợt 3a của bước 35 (W-047): gói và thuê bao phía khách, gói và giá, ghi đè theo khách, thuê bao
  của mọi khách ở mặt điều khiển. Đã chạy thử với core thật.
- Đợt 11 (17/11): nối đợt 3b của bước 35 (W-049): sổ khách theo thuê bao và hạn mức, chi tiết khách (thuê bao, xuất dữ
  liệu, quyền vào), màn "Vào dữ liệu khách" thật, thẻ gói ở Tổng quan, khoá nút theo tính năng của gói.
- Đợt 12 (17/11): dùng các API mới của core D-331 – D-334 (W-050): số người mỗi nút, ô cài đặt theo `schema`, tên
  website theo tên miền, tên nút trong "Nơi bạn làm việc", chọn khách cấp dưới khi uỷ quyền, ẩn cách đăng nhập máy
  chủ tắt, migrate placement bằng API, số người giữ role, lý do khi tạm khoá khách.
- Đợt 13 (17/11): chuyển khách đang làm việc (W-051): bộ chọn góc trên trái có khách vào được qua uỷ quyền / hỗ trợ,
  header `Autoxide-Tenant`, dải báo, trang "quyền đã hết". Chờ core cho biết quyền ở khách đang vào.
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
- Đợt 6: xong nhóm "core đã có API" của sổ thiết kế (W-043): Ctrl K tìm dữ liệu, duyệt và đăng ở danh sách, kiểm
  trước khi đăng, khác biệt khi menu bị 412. Đã thử với core thật.
- Đợt 7: tài khoản người mua của website đủ 9 mục như thiết kế (W-044, mẫu). Kế tiếp trong sổ: phần còn lại của tài
  khoản (đánh giá đơn, mua lại, đã nhận hàng, hoá đơn, đổi trả 3 bước có ảnh), rồi thanh toán (mã người tiếp thị, trả
  góp, giỏ chỉ hàng số).
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

**Core đã có API, chưa nối** (làm tiếp theo thứ tự, mỗi đợt gate xanh và thử với core thật):

- **Còn lại của bước 34:** xác nhận lại danh tính (`/auth/me/reauth`) cho lệnh nhạy cảm của tài khoản chỉ có
  passkey; người mua tách khỏi nhân sự (`/auth/customers`); đổi `requires_mfa` của role `admin`.
- Khách tự xuất dữ liệu của mình (`POST /kernel/tenants/{id}/exports` với `kernel.data.export`) ở Cài đặt.
- Website: ô địa chỉ khi đặt hàng dùng danh mục hành chính công khai của core (`GET /address/provinces`,
  `…/communes`) thay `src/sample/address.ts`; danh sách cửa hàng (`/organizations/public/stores`) thay phần mẫu khi
  phần thương mại có API (cửa hàng mẫu đang gắn với tồn kho mẫu).

Chờ core (nối ngay khi có):

- Hồ sơ công khai chưa có logo, thông tin pháp lý (mã số doanh nghiệp…), và website chưa biết nút nào là "website
  này" (tên miền gắn với một cửa hàng con vẫn hiện tên của nút gốc). Đã ghi ở `backend-debt.md`.
- **Bước 38**: tách nhánh thành khách con (nút "Yêu cầu tách" ở màn Cây tổ chức đã bỏ ở W-045).
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
- Core thật trên máy thử: danh mục hành chính cần `autoxide task address.import` một lần; chỉ có loại nút `tenant`,
  tạo thêm bằng `POST /organizations/unit-types`. Script thử bấm nhanh dễ chạm giới hạn 600 lời / phút của core (mọi
  lời đi từ một máy chủ Next.js): khi thử đặt `AUTOXIDE_HTTP_RATE_LIMIT_PER_MINUTE=0` ở core.
- Thử lời mời và đăng nhập bằng link với core thật: đặt ở core `AUTOXIDE_AUTH_LOGIN_LINK=true`,
  `AUTOXIDE_AUTH_INVITATION_URL=http://localhost:<cổng>/invitation?token={token}`,
  `AUTOXIDE_AUTH_LOGIN_LINK_URL=http://localhost:<cổng>/sign-in/link?token={token}`; thư nằm ở `data/mail` của core.
- Hai gate không chạy cùng lúc trên một máy (e2e dùng chung cổng 4010, 3100, 4012, 3200–3203).
