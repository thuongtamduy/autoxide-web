# Nhật ký quyết định

Chỉ thêm ở cuối, không sửa mục cũ. Đổi một quyết định = thêm mục mới ghi rõ nó thay mục nào.
Mục ghi **chủ dự án quyết** thì agent không tự đảo. Stack chung đã chốt ở D-096, D-097 của core.

Mẫu:

```
## W-NNN · <tiêu đề> — <ngày> — <chủ dự án quyết | agent quyết>
Quyết định: …
Lý do: …
Đã cân nhắc: …
```

---

## W-001 · Khởi tạo repo; màn hình đầu tiên là quản lý module — 2026-11-12 — chủ dự án quyết hướng, agent quyết cách làm

Quyết định:

- Monorepo pnpm + Turborepo, Biome; `apps/admin` (Next.js 16.4, App Router, React 19) và
  `packages/sdk` (`openapi-typescript` + `openapi-fetch`), theo D-097 của core.
- Màn hình đầu tiên: danh sách module (`GET /api/v1/kernel/modules`) và chi tiết một module
  (`GET /api/v1/kernel/modules/{name}`), chỉ xem — core không bật / tắt module lúc chạy (D-155
  của core). Kèm trang đăng nhập (mật khẩu, mã hai bước) và đăng xuất.
- Phiên: access token và refresh token của core nằm trong cookie `httpOnly`, `SameSite=Lax`,
  `Secure` khi chạy production. Cookie access hết trước token 30 giây. Proxy của Next.js 16
  (`src/proxy.ts`) làm mới token trước khi render: Server Component không ghi được cookie.
- Mỗi refresh token chỉ gửi core một lần: các request đồng thời trong một tiến trình dùng chung
  một lời gọi, kết quả giữ thêm 10 giây. Nhiều bản ứng dụng sau load balancer cần sticky
  session (ghi trong README).
- Ngôn ngữ không nằm trên URL: chọn theo cookie `NEXT_LOCALE`, rồi `Accept-Language`, mặc định
  tiếng Anh (như core). Trang quản trị không cần URL theo ngôn ngữ cho SEO.
- Ứng dụng gửi ngôn ngữ cho core (`Accept-Language`) và hiện `detail` của lỗi core trả về; câu
  của riêng giao diện nằm ở `messages/`.
- Test: Vitest (+ Testing Library, msw) cho hàm và component; Playwright e2e chạy bản build
  standalone với một core giả bằng Node (`e2e/mock-core.ts`). Gate e2e không cần dựng core Rust,
  và mỗi màn hình phải được thử với core thật trước khi báo xong.

Lý do: D-097 của core; phần còn lại là cách đơn giản nhất cho một màn hình chỉ đọc mà vẫn an
toàn (token không xuống trình duyệt, không đốt refresh token khi tải song song).

Đã cân nhắc: dựng core thật trong gate e2e — gate phụ thuộc toolchain Rust và một lần build
dài; core giả nhỏ, kiểu của nó kiểm bằng `tsc` theo cùng fixtures. Làm mới token ở client —
trái D-097 (refresh token ở trình duyệt).

## W-002 · Chưa dùng TanStack Query / Table, React Hook Form, Tiptap; component tự viết theo kiểu shadcn/ui — 2026-11-12 — agent quyết

Quyết định: màn hình module render hoàn toàn ở máy chủ (Server Component), form đăng nhập dùng
Server Action + `useActionState` + Zod. Nên chưa thêm các thư viện D-097 liệt kê cho màn hình
tương tác: TanStack Query, TanStack Table, React Hook Form, Tiptap. Component giao diện (`Button`,
`Card`, `Badge`, `Table`, `Input`) viết tay theo kiểu shadcn/ui (Tailwind + token màu), chưa
chạy CLI của shadcn và chưa thêm Radix.

Lý do: luật "không thêm thư viện thừa". Màn hình chỉ đọc, hai trường đăng nhập. Thêm từng thư
viện khi có màn hình cần nó: bảng có lọc / sắp xếp, form nhiều trường, trình soạn nội dung.

Đã cân nhắc: cài đủ ngay từ đầu — thêm phụ thuộc và JavaScript gửi xuống trình duyệt mà chưa
dùng.

## W-003 · TypeScript 7 cho ứng dụng; TypeScript 5 riêng trong `packages/sdk` để sinh mã — 2026-11-12 — agent quyết

Quyết định: dùng TypeScript 7 (bản ổn định mới nhất); Next.js 16.4 hỗ trợ qua CLI `tsc`.
`openapi-typescript` 7 vẫn cần API JavaScript của TypeScript 5, nên `packages/sdk` giữ
`typescript@5` trong devDependencies của riêng nó, chỉ để sinh `schema.d.ts` và kiểm kiểu gói đó.

Lý do: TypeScript 7 chưa có API JavaScript. Khi `openapi-typescript` hỗ trợ TypeScript 7 thì bỏ
bản 5.

Đã cân nhắc: giữ TypeScript 5 cho cả repo — lùi một bản lớn chỉ vì một công cụ sinh mã.

## W-004 · Dựng giao diện theo bản thiết kế quản trị 2; sổ điều hướng tạm ở giao diện — 2026-11-15 — chủ dự án quyết hướng, agent quyết cách làm

Quyết định:

- Giao diện theo bản thiết kế quản trị 2 của core (`docs/research/ui-design.md` mục 2.3 và 7 của
  core). Màu "Graphite & Oxide" sáng / tối là token CSS (`--bg`, `--ink`, `--accent`…); tên kiểu
  shadcn/ui (`--background`, `--primary`…) trỏ vào cùng giá trị nên component cũ khớp màu.
- Khung chung (`src/app/(admin)/layout.tsx`, `src/components/shell/`):
  - thanh bên theo phân hệ (232px từ 1280px, thu gọn được);
  - menu con hai bậc: các màn của phân hệ, rồi tab của màn;
  - thanh đáy trên điện thoại (Tổng quan · Tìm · Phân hệ);
  - bảng lệnh Ctrl K tìm không dấu;
  - menu tài khoản có giao diện sáng / tối / theo máy và ngôn ngữ.
- Sổ điều hướng nằm ở `src/nav/nav.ts`: một nguồn cho thanh bên, menu con, thanh đáy và bảng
  lệnh. Mục chỉ hiện khi module của nó đã cài trên core và người dùng có permission. Khi core có
  sổ điều hướng (bước 51 của core, `Module::navigation`) thì lấy từ core và bỏ file này.
- Chỉ dựng màn có API trong `openapi.json`; màn của phân hệ chưa có module (bán hàng, sản phẩm…)
  chờ core.
- Màn Module dời vào Cài đặt (`/settings/modules`); đường dẫn cũ `/modules/…` chuyển hướng 308.
- Giao diện sáng / tối lưu trong cookie `ax_theme` (không phải secret); không có cookie thì theo
  máy. Đổi bằng Server Action như đổi ngôn ngữ, chạy được khi chưa tải JavaScript.
- Bảng trên điện thoại thành thẻ: `Table cards` và `Td label` (nhãn cột hiện trước giá trị).
- Chữ: Inter / JetBrains Mono khi máy có, không thì phông hệ thống. Chưa tải phông từ Google
  Fonts, để build không cần mạng.

Lý do: chủ dự án yêu cầu dựng theo bản thiết kế. Sổ điều hướng một nguồn là kết luận của lần rà
soát bản thiết kế (R4): mỗi màn tự khai menu thì các màn trong cùng phân hệ lệch nhau.

Đã cân nhắc: chép nguyên CSS của bản thiết kế — bản thiết kế có cả màn mẫu và lớp thử nghiệm,
nên chỉ chép phần khung đang dùng. Dùng Radix cho popover và menu — HTML `popover` đã đủ
(Esc, bấm ra ngoài để đóng, lớp trên cùng), không thêm thư viện.

## W-005 · Màn "Tài khoản của tôi"; SDK theo core v0.12.0; thêm `uqr` cho mã QR — 2026-11-15 — agent quyết

Quyết định:

- Màn `/account`, bốn tab là bốn đường dẫn con: Hồ sơ (`/account`), Đăng nhập và bảo mật
  (`/account/security`), Phiên đăng nhập (`/account/sessions`), Dữ liệu của tôi (`/account/data`).
  Mở từ menu tài khoản (avatar) và bảng lệnh; không lên thanh bên. Tab "Thông báo" của bản thiết
  kế chưa dựng vì core chưa có API.
- Nâng `CORE_VERSION` của SDK từ v0.5.0 lên v0.12.0 (bản core đang chạy): bật xác thực hai bước
  và thêm passkey nay cần mật khẩu hiện tại (`StartTotpRequest`, `StartPasskeyRegistrationRequest`).
- Thêm `uqr` (0.1.3, không phụ thuộc gì) để vẽ địa chỉ `otpauth://` thành mã QR. Mã sinh ở máy
  chủ trong Server Action, trình duyệt chỉ nhận một path SVG, không tải thư viện.
- Cookie `ax_session` (`httpOnly`) giữ `session_id` của phiên, đặt cùng cookie token lúc đăng
  nhập, làm mới token và đổi mật khẩu. Dùng để đánh dấu "phiên này" và làm `keep` khi đăng xuất
  mọi phiên khác; thiếu cookie thì không gửi lệnh đó (thiếu `keep`, core đăng xuất cả phiên này).
- Client của SDK nhận `userAgent`; máy chủ của ứng dụng chuyển `User-Agent` của trình duyệt cho
  core ở mọi lời gọi, để phiên tạo ra (đăng nhập, đổi mật khẩu) mang đúng tên thiết bị.
- Passkey: id của nghi thức nằm trong cookie `httpOnly` `ax_passkey` (5 phút) giữa hai bước;
  trình duyệt chỉ nhận options và chạy `navigator.credentials.create()`.
- Tải dữ liệu qua route handler `GET /account/export` (máy chủ gọi core rồi trả file JSON).
- Hộp thoại dùng `<dialog>` của HTML (`showModal`); thông báo sau thao tác là một vùng
  `role="status"`. Thời điểm hiện theo múi giờ của máy người xem (`Time`): máy chủ render giờ UTC
  kèm chữ "UTC", trình duyệt đổi sang giờ địa phương sau khi tải.

Lý do: làm đúng hợp đồng `openapi.json` của core mà token không xuống trình duyệt. Mã QR tự viết
cần bộ mã hoá Reed–Solomon và chọn mặt nạ — vài trăm dòng, dễ sai; `uqr` nhỏ và không kéo thêm gì.

Đã cân nhắc: `qrcode` (kéo theo `pngjs`, `yargs`…); vẽ QR ở trình duyệt (thêm JavaScript tải
xuống). Đọc `session_id` từ access token — token là chuỗi mờ theo hợp đồng của core, không dựa
vào nội dung bên trong. Hộp thoại bằng Radix — `<dialog>` đã có Esc, giữ con trỏ, lớp trên cùng.
