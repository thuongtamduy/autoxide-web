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

## W-006 · Dữ liệu mẫu cho phần core chưa có API — 2026-11-15 — chủ dự án quyết

Quyết định:

- Chỗ nào core chưa có API thì giao diện dựng đủ màn theo bản thiết kế bằng **dữ liệu mẫu**; khi
  core có API thì thay bằng API thật. Thay phần "chỉ dựng màn có API trong `openapi.json`; màn của
  phân hệ chưa có module chờ core" của W-004. Luật "chỉ gọi REST API công khai của core" vẫn giữ
  cho mọi thứ core đã có: không thay API có sẵn bằng dữ liệu mẫu.
- Một cách duy nhất:
  - mọi dữ liệu mẫu và hàm giả nằm ở `apps/admin/src/sample/`, mỗi phân hệ một file (vd
    `sample/org.ts`). Kiểu theo hình dạng dự kiến của API trong đặc tả bước của core, có envelope
    `{ data }` / `{ data, pagination }`. Mỗi hàm `async`, cùng chữ ký như sẽ gọi API, kèm comment
    "Thay bằng `<endpoint>` (bước N) khi core có";
  - lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ (Server Action gọi hàm mẫu); khởi
    động lại thì về ban đầu. Không ghi file, không gọi mạng;
  - `sampleDataEnabled()` (`src/sample/index.ts`) đọc `AUTOXIDE_WEB_SAMPLE_DATA` qua
    `src/lib/env.ts`: mặc định bật khi `NODE_ENV !== "production"`, tắt ở production;
    `true` / `false` để ép. Playwright bật nó để luồng dùng dữ liệu mẫu cũng được thử;
  - nhãn `SampleBadge` ("Dữ liệu mẫu · chờ API bước N", `title` ghi endpoint còn thiếu) cạnh tiêu
    đề của khối, tab hay màn dùng dữ liệu mẫu; tab dùng dữ liệu mẫu có chữ nhỏ "mẫu";
  - sổ điều hướng: `NavPage.sample = { step }` — màn chỉ hiện khi bật dữ liệu mẫu (`Viewer.sample`),
    không đòi module đã cài, vẫn theo permission;
  - dữ liệu mẫu không chứa thông tin cá nhân thật: email miền `example.com`, số điện thoại, mã số
    thuế, địa chỉ ghi rõ là mẫu; tiền là số nguyên đơn vị nhỏ nhất + mã tiền tệ; giờ UTC.
- Mỗi chỗ thiếu API vẫn ghi vào `docs/prompts/web-build-api-gaps.md` của core, cột "Giao diện đang
  làm gì" ghi "Dữ liệu mẫu (`src/sample/<file>.ts`)".

Lý do: chủ dự án muốn thấy và thử đủ màn theo bản thiết kế trong lúc team API làm từ bước 31. Một
thư mục, một biến và một nhãn giữ phần giả tách khỏi phần thật, dễ tìm để xoá khi có API.

Đã cân nhắc: core giả chạy riêng (như `e2e/mock-core.ts`) cho phần thiếu — trộn API thật và giả ở
cùng một địa chỉ, khó biết phần nào là thật; dữ liệu mẫu rải trong component — khó tìm để thay.

## W-007 · Màn "Người dùng và role"; trang mở từ link trong thư; component biểu mẫu dùng chung — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Tổ chức (`org`) vào sổ điều hướng, đứng sau Tổng quan và trước Cài đặt theo thứ tự 12
  phân hệ của bản thiết kế. Màn `/org/access`, mỗi tab một đường dẫn con: `users`, `roles` (API
  thật), `invitations`, `delegations`, `public`, `support` (dữ liệu mẫu, W-006, bước 34 của core).
  `NavPage.permission` nhận một danh sách (có một trong số đó là đủ): màn hiện khi có
  `auth.users.read` hoặc `auth.roles.read`. Mục này không ghi `module`: thiếu module `auth` thì
  không đăng nhập được.
- Danh sách người dùng của core chưa kèm role: mỗi trang 25 người, role của từng người lấy bằng
  `GET /users/{id}/roles` song song ở máy chủ. Có API trả kèm role thì bỏ (ghi ở chỗ thiếu API).
- Sửa role và đổi tên người dùng gửi `If-Match` với `ETag` đã đọc: hai người sửa cùng lúc thì người
  sau nhận 412 thay vì ghi đè. Tạo / sửa role là trang riêng (`/org/access/roles/new`,
  `/org/access/roles/{id}`), không phải hộp thoại: bộ chọn permission dài, nhóm theo module, có ô
  tìm không dấu; ô chọn giữ trong state để core báo lỗi thì lựa chọn không mất.
- "Đặt mật khẩu mới" của quản trị viên theo đúng core: chỉ đặt được mật khẩu **đầu tiên**; muốn
  đổi mật khẩu đã có thì gửi thư đặt lại mật khẩu (endpoint công khai `POST /auth/password-reset`).
- Trang công khai `/verify-email`, `/forgot-password`, `/reset-password` trong nhóm route `(public)`,
  cùng khung với trang đăng nhập; `matcher` của proxy bỏ qua chúng (`src/proxy.ts`, có test).
  Server Action gọi core như khách (`send(…, { guest: true })`), vì access token cũ trong cookie
  làm core trả 401 dù endpoint không cần đăng nhập. Mở link xác minh chưa gửi gì: người dùng bấm
  nút thì mới gửi token (GET không đổi dữ liệu; trình quét link của hộp thư không dùng mất token).
  "Quên mật khẩu?" luôn báo cùng một câu dù email có tài khoản hay không.
- `Dialog`, `Field` / `FormAlert` / `useSubmit`…, `ToastProvider`, `PageTabs` dời từ
  `components/account/` sang `components/ui/` (câu chung chuyển từ `account.form` sang `form`) để
  mọi màn dùng chung; thêm `SelectField`, `TextareaField`, `CheckField`, `ConfirmAction` (hỏi lại,
  nêu từng hệ quả), `InlineAction` và `Flash` (báo một câu sau khi Server Action chuyển trang).
  Nút nằm trên phần sẽ biến mất sau thao tác (vd "Khoá" đổi thành "Mở khoá") báo qua `useSubmit`.

Lý do: làm đúng hợp đồng `openapi.json`, một cách làm cho mỗi việc trên mọi màn.

Đã cân nhắc: tự xác minh email ngay khi mở trang — tiện hơn một bấm nhưng GET đổi dữ liệu và trình
quét link dùng mất token; ẩn cột role trong danh sách tới khi core có API — bản thiết kế và giao
việc cần role ở danh sách.

## W-008 · Màn Nội dung (bài viết, trình soạn); thêm Tiptap cho thân bài — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Nội dung (`content`, biểu tượng `posts`) vào sổ điều hướng, đứng sau Tổng quan và trước
  Tổ chức theo thứ tự 12 phân hệ. Màn "Bài viết" `/content` (module `content`, permission
  `content.read`), soạn bài ở `/content/new` (`?kind=page` cho trang) và `/content/{id}`.
- Danh sách lọc theo trạng thái (tab là link `?status=…`), loại, ngôn ngữ và chữ (`q` của
  `GET /content/entries`, có pagination theo con trỏ và giữ bộ lọc), mới sửa lên đầu
  (`sort=updated_at`). Không dùng `GET /content/search` cho ô tìm: nó không lọc theo trạng thái và
  không có trang sau.
- Thân bài là JSON ProseMirror / Tiptap theo danh sách node của core, nên thêm **Tiptap 3.32.2**
  (`@tiptap/react`, `@tiptap/pm`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-table`,
  ghim đúng bản, phát hành hơn hai tuần). Thay phần "chưa dùng Tiptap" của W-002. Chỉ bật node
  core nhận (tiêu đề 2–4, danh sách, trích dẫn, mã, bảng, đường kẻ); `image` (chỉ id media) và
  `embed` là node tự khai để bài có sẵn không mất khối. JSON gửi đi luôn qua `toCoreBody`
  (`src/lib/content.ts`, có test): bỏ thuộc tính Tiptap tự thêm (`target`, `rel`, `class` của
  link…), bỏ link không an toàn, bỏ đoạn trống cuối bài. Core vẫn kiểm lại từng node.
- Mọi lệnh đổi bài gửi `If-Match` với `ETag` đã đọc; Server Action trả kèm `ETag` mới. Lệnh cần
  bản đã lưu (đăng, hẹn giờ, link xem trước) lưu chữ đang sửa trước rồi mới làm. 412 thì báo, không
  ghi đè. Danh mục, thẻ, tác giả lưu riêng (`PUT …/terms`, `…/authors`, có hiệu lực ngay).
- Nút AI (gợi ý SEO, dịch) chỉ bật khi `GET /ai/status` báo `enabled`; không thì tắt kèm lý do.
  Gợi ý chỉ điền vào bản nháp; người bấm lưu thì bài mang `ai_generated`. Đăng bài có AI cần đánh
  dấu "đã duyệt" (`ai_reviewed`).
- Link xem trước trỏ về trang công khai `/preview?token=` của ứng dụng này (proxy bỏ qua, gọi
  `GET /content/public/preview` như khách), vì core chưa cho biết địa chỉ website.
- Website theo tên miền, trang bắt buộc theo luật và bài thuộc website nào dùng dữ liệu mẫu
  (`src/sample/content.ts`, W-006; bước 37 của core).

Lý do: làm đúng hợp đồng `openapi.json` và tài liệu `docs/CONTENT.md` của core; thân bài phải là
JSON của trình soạn, tự viết trình soạn ProseMirror là vài nghìn dòng.

Đã cân nhắc: textarea Markdown đổi sang JSON — mất bảng, link an toàn và vị trí lỗi của core;
Lexical / Slate — JSON khác hình dạng core nhận.

## W-009 · Nhóm màn Cài đặt: Cài đặt chung, API key và AI agent, Nhà phát triển — 2026-11-15 — agent quyết

Quyết định:

- Nhóm `settings` của sổ điều hướng có ba màn theo thứ tự: Cài đặt chung (`/settings`), API key
  và AI agent (`/settings/api-keys`), Nhà phát triển (`/settings/developers`). Mục "Module" của
  W-004 thành một tab của Cài đặt chung, đường dẫn `/settings/modules` giữ nguyên (route group
  `settings/(general)`). `/settings` mở tab đầu tiên người xem được dùng.
- Cài đặt chung: tab theo bản thiết kế. Module, Webhook, Nhật ký audit gọi core thật; Gói và thuê
  bao (bước 35), Tên miền (bước 33), Kết nối đối tác (bước 33/36/39), Job (bước 52) là dữ liệu mẫu
  (W-006, `src/sample/settings.ts`); riêng mục AI của Kết nối đọc thật `GET /api/v1/ai/status`.
  "Nhân sự" là link sang `/org/access/users`, không dựng lại.
- API key là của chính người đăng nhập, nên màn này hiện với mọi người đã đăng nhập (không đòi
  permission). Tạo key là trang riêng (`/settings/api-keys/new`) dùng lại bộ chọn permission của
  màn Role — tách thành `components/access/permission-picker.tsx`, `RoleEditor` dùng lại nó — và
  chỉ bày permission người tạo đang có. Lệnh chờ duyệt và nhật ký gọi tool MCP là dữ liệu mẫu
  (bước 51, `src/sample/agent.ts`); tab "Kết nối MCP" chỉ là hướng dẫn: địa chỉ `<core>/mcp` lấy
  từ `AUTOXIDE_API_URL`.
- Nhà phát triển: lần giao webhook của mọi endpoint gộp từ `/webhooks/{id}/deliveries` (song song,
  25 lần giao mỗi endpoint) vì core chưa có danh sách xuyên endpoint; nhật ký request và event theo
  bản ghi là dữ liệu mẫu (bước 52, `src/sample/devtools.ts`). "Tải OpenAPI" đi qua route
  `/settings/developers/openapi.json` của ứng dụng; nút "Tài liệu API" chỉ hiện khi core bật
  `/api/docs`.
- Secret ký webhook và khoá API trả về trình duyệt đúng một lần, trong trạng thái của Server
  Action, để người dùng chép (`SecretOnce`, `CopyButton` ở `components/ui/secret-once.tsx`); ứng
  dụng không lưu chúng ở đâu. Token đăng nhập vẫn không xuống trình duyệt.
- `InlineAction` báo xong ngay khi Server Action trả về (`useSubmit`), như `ConfirmAction`: dòng
  chứa nút có thể biến mất sau thao tác (từ chối một yêu cầu đang chờ).
- Hàm dùng chung cho Server Action gọi dữ liệu mẫu (`sampleGuard`, `translateSample`,
  `finishSample`) dời vào `src/lib/sample-action.ts`; Tổ chức và Cài đặt cùng dùng.
- Câu trong `messages/` là cú pháp ICU: không viết `<…>` trần (là thẻ). Vitest kiểm mọi câu của
  hai ngôn ngữ.

Lý do: làm đúng bản thiết kế và hợp đồng `openapi.json`; phần thiếu API theo đúng cơ chế W-006.

Đã cân nhắc: tạo API key trong hộp thoại — bộ chọn permission dài, nên dùng trang riêng như tạo
role. Tự gọi `/mcp` để kiểm kết nối — tab chỉ cần hướng dẫn, không cần API. Lọc endpoint theo
trạng thái ở core — chưa có tham số, nên lọc trên trang đang xem (tối đa 200 endpoint).

## W-010 · Phần còn lại của phân hệ Nội dung: Thư viện media, Trang và cấu trúc, Menu — 2026-11-15 — agent quyết

Quyết định:

- Nhóm `content` của sổ điều hướng có thêm, theo thứ tự sau "Bài viết": "Trang và cấu trúc"
  (`/content/structure`), "Menu" (`/content/menus`, dữ liệu mẫu, `sample: { step: "menus" }`),
  "Thư viện media" (`/content/media`, module `media`, permission `media.read`).
- **Ảnh và tải lên đi qua máy chủ của giao diện**, token không xuống trình duyệt:
  - `GET /media/{id}/content` (route của giao diện) gọi `GET /api/v1/media/{id}/content` của core
    với token trong cookie, chuyển nguyên `Range`, `If-None-Match`, `ETag`, `Cache-Control`,
    `Content-Disposition`, CSP; `?download=1` để tải về. Chưa đăng nhập thì gọi như khách: chỉ tệp
    công khai tải được, đúng như core. Trang xem trước công khai và trình soạn dùng route này;
  - `POST /media/upload`, `PUT /media/{id}/replace` chuyển nguyên dòng dữ liệu của tệp sang core
    (`duplex: "half"`, không chép cả tệp vào bộ nhớ), kiểm `Origin` như Server Action. Trình duyệt
    gửi bằng XMLHttpRequest vì chỉ nó báo được tiến độ gửi lên;
  - `media/…` nằm ngoài `matcher` của proxy: proxy chép thân request và cắt ở 10 MB
    (`proxyClientMaxBodySize`). Route tự làm việc của proxy (`src/lib/route-session.ts`): access
    token hết thì đổi refresh token qua `refreshTokens` và đặt lại cookie.
- Thư viện media: bộ lọc nằm trên địa chỉ (`?folder=&kind=&tag=&alt=missing&visibility=&trash=1&
  view=table&item=`); khung chi tiết là `?item=`. "Thiếu alt" lọc trên trang đang xem (core chưa có
  tham số). Alt của ngôn ngữ mặc định (`CONTENT_LOCALES[0]`) là `alt` thật của tệp; alt các ngôn
  ngữ khác và cờ "ảnh trang trí" là dữ liệu mẫu (`src/sample/media.ts`), vì core chỉ có một `alt`.
  Gợi ý alt bằng AI chỉ bật khi `GET /ai/status` báo `enabled` và `images`; chỉ điền vào ô.
- Bộ chọn ảnh (`components/media/media-picker.tsx`) dùng lại ở trình soạn: ảnh đại diện (kèm
  `featured_media_alt` theo ngôn ngữ của bài), ảnh chia sẻ (`og_media_id`), nút "Ảnh" chèn node
  `image` (`mediaId`, `alt`, `caption`) và "Sửa ảnh" đổi alt / chú thích của ảnh đang chọn. Bài
  đăng chỉ nhận ảnh công khai (`content.media_not_public`), nên ảnh riêng tư có ô "chuyển công khai"
  bật sẵn (`PATCH` với `If-Match: *`, chỉ đổi `visibility`).
- Lưu danh mục, thẻ, tác giả trong trình soạn không còn đặt lại bản nháp đang sửa
  (`accept(…, { keepDraft: true })`): trước đây lưu danh mục làm mất chữ và ảnh chưa lưu.
- Trang và cấu trúc: tab là đường dẫn con (`terms`, `authors`, `menus`, `redirects`, `history`).
  Danh sách của core không kèm `ETag` từng dòng, nên trước khi sửa (chuyển trang cha, danh mục, tác
  giả, chuyển hướng) Server Action đọc lại bản ghi lấy `ETag` và so `updated_at` với giá trị trang
  đã hiện: khác thì báo "người khác vừa sửa" thay vì ghi đè.
- So hai phiên bản: `src/lib/revision-diff.ts` (hàm thuần, có test) so ô của `snapshot` và thân bài
  theo từng khối (LCS); `RevisionDiffView` dùng chung cho tab Lịch sử phiên bản và nút "Xem khác
  biệt" của trình soạn (phiên bản so với phiên bản ngay sau, mới nhất so với bản nháp đã lưu).
- Menu của website là module `menus` riêng (đề bài `docs/prompts/menus-module.md` của core), chưa
  có: cả màn dựng bằng dữ liệu mẫu (`src/sample/menus.ts`) theo hình dạng API trong đề bài, nhãn
  "Dữ liệu mẫu · chờ module menus". Cây sửa ở dạng phẳng (`src/lib/menu-tree.ts`: lên, xuống, thụt
  vào, kéo ra, tối đa 4 cấp, 200 mục); lưu cả cây với `If-Match`; nút "Thử: người khác vừa lưu" chỉ
  có ở dữ liệu mẫu để thấy 412. API menu cũ của `content` không dùng để sửa; chỉ đọc làm nguồn
  "Nhập menu cũ" (tab Menu của Trang và cấu trúc, và khối nhập ở màn Menu).
- `SampleBadge` nhận `step="mới"` ("chờ API mới") và `module` ("chờ module …").

Lý do: làm đúng bản thiết kế và hợp đồng `openapi.json`; ảnh riêng tư cần token mà token không được
xuống trình duyệt, nên mọi byte của tệp đi qua máy chủ của giao diện.

Đã cân nhắc: tải lên bằng Server Action — giới hạn thân 1 MB và không có tiến độ; nâng
`proxyClientMaxBodySize` lên 100 MB — proxy giữ cả tệp trong bộ nhớ cho mỗi lần tải; trỏ `<img>`
thẳng vào core — lộ địa chỉ nội bộ của core và không tải được ảnh riêng tư; tự dựng trình sửa menu
trên API cũ của `content` — sắp ngừng, sai chỗ theo quyết định của chủ dự án.

## W-011 · Phân hệ Tiếp thị: Biểu mẫu, Bản tin, Bình luận — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Tiếp thị (`mkt`, biểu tượng `mega`) vào sổ điều hướng, đứng sau Tổng quan theo thứ tự 12
  phân hệ của bản thiết kế. Ba màn, mỗi màn một module của core: Biểu mẫu `/marketing/forms`
  (`forms`), Bản tin `/marketing/newsletter` (`newsletter`), Bình luận `/marketing/comments`
  (`comments`). Bản thiết kế gộp cả ba vào một màn bốn tab; tách thành ba màn vì mỗi màn có nhiều
  tab và trang con (mỗi tab một đường dẫn, W-004). Khuyến mại và tiếp thị liên kết (bước 43, 49)
  vào nhóm này khi dựng. Màn hiện khi module đã cài và người xem có permission đọc hoặc xuất của nó.
- Mỗi màn có tab "Dữ liệu theo email" (yêu cầu của chủ dữ liệu): tra bằng Server Action (POST),
  không đặt email lên địa chỉ trang; tải JSON dựng ở trình duyệt từ đúng dữ liệu core trả; xoá phải
  xác nhận, nêu hệ quả của từng module.
- Lệnh sửa của ba module bắt buộc `If-Match`. Bảng danh sách không có `ETag` từng dòng, nên mọi lệnh
  sửa đi qua `versioned` (`src/lib/engage-server.ts`): đọc bản ghi lấy `ETag`, so `updated_at` với
  bản người dùng đang thấy (khác thì báo 412, không ghi), rồi ghi kèm `If-Match` — core vẫn từ chối
  nếu có người sửa xen giữa. `ETag` vẫn là chuỗi mờ, giao diện không đọc nội dung của nó.
- Thao tác đảo được (đổi trạng thái bài nộp, duyệt / từ chối / spam / giữ lại bình luận, đóng / mở
  form, đóng / mở / ẩn bình luận của bài, tạm dừng / tiếp tục chiến dịch, bỏ chặn) báo kèm nút
  Hoàn tác (`ChangeButtons`, `components/engage/actions.tsx`): Server Action trả trạng thái cũ và
  `updated_at` mới, Hoàn tác gửi lại trạng thái cũ cũng có kiểm phiên bản. `ToastProvider` nhận
  thêm `undo` (không đổi cách gọi cũ). Thao tác không đảo được (xoá, huỷ chiến dịch, gửi ngay, xoá
  dữ liệu theo email) hỏi lại và nêu hệ quả (`ConfirmButton`).
- Trình sửa form là trang riêng (`/marketing/forms/new`, `…/{id}/edit`): trường giữ trong state, gửi
  một lần dạng JSON; lỗi của core theo đường dẫn (`fields[2].options`) hiện dưới đúng thẻ. Lựa chọn
  của trường viết mỗi dòng `giá trị | nhãn tiếng Việt | nhãn tiếng Anh`. Form mới có sẵn ba trường
  hay dùng (`STARTER_FIELDS`).
- Thân chiến dịch theo đúng định dạng core quy định: bản chữ (bắt buộc) và bản HTML (tuỳ chọn, gửi
  nguyên văn) — không phải JSON của trình soạn bài, nên **không dùng Tiptap** cho bản tin. Core không
  lọc HTML: bản xem trước nằm trong `<iframe sandbox="">` (không script, không cookie). Thư quảng cáo
  hiện rõ quy định của core (nhãn ở đầu tiêu đề, địa chỉ người gửi ở chân thư, giới hạn mỗi ngày,
  NĐ 91/2020 chưa đối chiếu văn bản gốc); nhãn hiện là giá trị mặc định `[QC]` vì core chưa có API
  đọc cấu hình bản tin. Hẹn giờ dùng ô `datetime-local` theo giờ máy người xem, đổi sang ISO UTC ở
  trình duyệt.
- Xuất CSV đi qua route `GET /marketing/forms/{id}/export` của ứng dụng (máy chủ gọi core bằng token
  trong cookie, trả nguyên tệp core sinh — core đã chặn ô bắt đầu bằng `=`, `+`, `-`, `@`).
- Nhập người đăng ký: tệp CSV hoặc chữ dán, đọc ở máy chủ (`parseSubscriberCsv`), bỏ dòng sai /
  trùng kèm số dòng; nguồn đồng ý bắt buộc (core lưu làm bằng chứng). Tối đa 1000 người một lần như
  core.
- Đích của bình luận chỉ có `target_type` + `target_id`: với `content.entry` giao diện đọc tiêu đề
  qua API của module `content` khi người xem có `content.read` (`src/lib/comments-server.ts`); loại
  khác hiện id. Tab "Theo bài" lấy các đích có bình luận gần đây (core chưa có danh sách đích) và có
  ô mở thẳng một đích. Chữ bình luận hiện như chữ thường (`white-space: pre-wrap`), không chèn
  `body_html`.
- Cài đặt bình luận của máy chủ đọc thật (`GET /comments/public/settings`); cài đặt theo từng khách
  và mức xác thực tài khoản (NĐ 147/2024) là dữ liệu mẫu (W-006, `src/sample/engage.ts`, bước 33 và
  37 của core).

Lý do: làm đúng hợp đồng `openapi.json` và nghiệp vụ của ba module (`docs/prompts/forms-newsletter-comments.md`
của core); giữ một cách làm cho mỗi việc với các màn đã có.

Đã cân nhắc: một màn bốn tab như bản thiết kế — mỗi phần có trang con riêng (bài nộp, chiến dịch,
người đăng ký, bình luận), một màn sẽ quá sâu. Tiptap cho bản tin rồi đổi sang HTML — mất HTML
email có sẵn (bảng, style nội dòng) khi mở lại, và core không nhận JSON. Gửi `If-Match` bằng `ETag`
đọc lúc render từng dòng — phải gọi chi tiết cho mọi dòng của bảng mỗi lần mở trang.

## W-012 · Màn Cây tổ chức và phân hệ Tuân thủ (dữ liệu mẫu); hộp thoại form dùng chung — 2026-11-15 — agent quyết

Quyết định:

- Nhóm `org` có màn "Cây tổ chức" (`/org`) đứng trước "Người dùng và role" (`sample: { step: "34" }`,
  permission `organizations.units.read`). Máy tính: cây bên trái, chi tiết nút bên phải; điện thoại:
  danh sách → chi tiết theo `?unit=` (có thì hiện chi tiết, không thì hiện cây), chỉ bằng CSS, không
  JavaScript. Chi tiết nút: ai làm ở nút (gồm người ở nút cha có độ sâu `subtree` / `tenant`), cài
  đặt hiệu lực kèm nút nguồn (đặt riêng / dùng lại giá trị kế thừa), thêm nút con (Hoàn tác = lưu
  trữ nút vừa tạo, như `POST …/status {archived}` của bước 34), yêu cầu tách nhánh, mời thành viên
  (dùng lại `InviteDialog` và lời mời mẫu của `org.ts`, role thật của core).
- Cây mẫu của `org.ts` thêm Miền Bắc (CN Cầu Giấy chuyển về dưới đó, như bản thiết kế), sàn Chợ Bếp
  Mộc và sáu nút người bán; `SAMPLE_UNIT_IDS` cho phân hệ khác trỏ đúng nút. Hồ sơ công khai (tab
  của Phân quyền) bỏ sàn và người bán: gian hàng là việc của bước 46. Phần riêng của màn (thành
  viên, cài đặt theo nút, yêu cầu tách) ở `src/sample/org-tree.ts` để `org.ts` không quá dài.
- Phân hệ Tuân thủ (`legal`, biểu tượng `shield`) vào sổ điều hướng sau Tổ chức, trước Cài đặt
  (thứ tự `RAIL_TENANT`), hai màn `sample: { step: "37" }`: "Tình trạng tuân thủ" (`/compliance`,
  tab `websites`, `kyc`, `privacy`, `documents`, `reports`) và "Hồ sơ và dữ liệu cá nhân"
  (`/compliance/records`, tab `purposes`, `retention`, `posting`, `documents`, `cases`, `ai`,
  `requests`). Hai route group (`(status)` và `records`) dùng chung một layout chặn khi tắt dữ liệu
  mẫu. Tab của "Tình trạng" là tóm tắt và việc gấp (nộp hồ sơ Bộ Công Thương, duyệt KYC, sự cố 72
  giờ); sổ dùng hằng ngày (phát hành văn bản, xử lý vụ việc, yêu cầu của chủ thể) nằm ở "Hồ sơ".
- Mọi điểm luật hay đổi là dữ liệu có phiên bản và ngày hiệu lực (`src/sample/compliance-rules.ts`,
  theo `compliance_rules` của bước 37): danh sách kiểm hồ sơ (bản 1 theo NĐ 52/2013 – NĐ 85/2021 tới
  30/6/2026, bản 2 từ 01/7/2026), việc cần KYC, hạn sự cố, hạn vụ việc theo ngày làm việc, giới hạn
  lưu, hạn trả lời yêu cầu của chủ thể (đề xuất). Màn hiện căn cứ (văn bản, điều, ngày hiệu lực) từ
  dữ liệu đó (`Basis`), kèm "cần đối chiếu văn bản gốc / người có chuyên môn pháp lý" khi quy tắc
  đánh dấu. Ngày hiệu lực hiện như ngày lịch (`Day`, không đổi múi giờ).
- Một bộ dữ liệu: website và trang bắt buộc lấy từ `src/sample/content.ts` (tạo nháp từ mẫu ở màn
  Nội dung thì danh sách kiểm đổi theo), chủ thể KYC là nút người bán của `org.ts`, mức xác thực bình
  luận đọc từ `src/sample/engage.ts` (đặt ở màn Bình luận).
- Phần THẬT: trang nguồn của văn bản pháp lý là trang đã đăng của `content` (đọc lại ngay lúc phát
  hành, không tin danh sách trình duyệt gửi); tab Nhãn AI đọc bài có `ai_generated` trong 100 bài sửa
  gần nhất (core chưa có bộ lọc); yêu cầu của chủ thể dẫn tới các tab "dữ liệu theo email" thật của
  Biểu mẫu, Bản tin, Bình luận (chỉ hiện module đã cài và người xem có permission xuất).
- Thao tác không đảo được có hộp xác nhận nêu từng hệ quả: ghi nộp hồ sơ (kèm ô "tôi đã nộp"), phát
  hành văn bản (kèm ô "bản đã phát hành không sửa được"), quyết định vụ việc, ghi nhận sự cố (bắt đầu
  đếm 72 giờ), duyệt KYC, từ chối yêu cầu. Thao tác đảo được (tắt mục đích, ẩn tạm đích, bỏ nhãn AI)
  báo kèm Hoàn tác qua `ChangeButtons` của phân hệ Tiếp thị.
- Hộp thoại form mô tả bằng dữ liệu: `FormDialog` và `InlineForm` (`components/ui/form-dialog.tsx`)
  nhận Server Action và danh sách ô (`FieldSpec`: text, date, number, select, textarea, check,
  checks, hidden) với chữ đã dịch từ Server Component; gom lỗi một lần, lỗi dưới từng ô, con trỏ về
  ô sai đầu tiên; action trả `undo` thì báo kèm Hoàn tác, trả `go` thì mở trang đó. Màn mới dùng nó
  thay cho viết một component form cho mỗi hộp thoại.
- Tải bộ hồ sơ (`/compliance/websites/{id}/dossier`) và sổ hoạt động xử lý
  (`/compliance/records/processing-register`) là route của giao diện trả JSON từ dữ liệu mẫu; khi core
  có API thì route gọi core bằng token trong cookie rồi trả nguyên tệp, như xuất CSV của Biểu mẫu.
- Core giả có thêm `POST /__content/legal` (một trang đã đăng, một bài `ai_generated`) cho e2e của
  Tuân thủ, không đổi dữ liệu ban đầu của các test khác.

Lý do: chủ dự án muốn dựng đủ hai phân hệ theo bản thiết kế trong lúc core làm bước 34 và 37 (W-006);
luật số hai của core đòi điểm luật hay đổi là dữ liệu có ngày hiệu lực và ghi căn cứ.

Đã cân nhắc: một màn Tuân thủ duy nhất với 14 tab — quá dài trên điện thoại, hai bản thiết kế đã
tách hai màn. Điện thoại dùng JavaScript để đổi cây / chi tiết — `?unit=` đã đủ, nút quay lại của
trình duyệt chạy đúng. Viết một component form cho mỗi hộp thoại như các màn trước — hơn hai mươi
hộp thoại mới, cùng một khuôn.
