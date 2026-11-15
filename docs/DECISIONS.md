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

## W-013 · Phân hệ Sản phẩm: Sản phẩm và giá, Tồn kho (dữ liệu mẫu) — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Sản phẩm (`catalog`, biểu tượng `box`) vào sổ điều hướng, đứng ngay sau Tổng quan theo
  thứ tự `RAIL_TENANT` của bản thiết kế. Hai màn, cả hai dựng hoàn toàn bằng dữ liệu mẫu (W-006) vì
  core chưa có module `catalog` (bước 41) và `inventory` (bước 42): "Sản phẩm và giá" `/catalog`
  (`sample: { step: "41" }`, permission `catalog.products.read`) và "Tồn kho" `/catalog/inventory`
  (`sample: { step: "42" }`, `inventory.read`). Permission dự kiến của hai đặc tả khai ở
  `src/lib/catalog.ts`. Tắt dữ liệu mẫu thì hai màn trả 404 (`catalog/gate.tsx`).
- Mỗi tab một đường dẫn con. Sản phẩm và giá: `/catalog` (sản phẩm), `categories`, `prices`, `tax`,
  `imports` trong route group `(products)`; chi tiết sản phẩm `/catalog/products/{id}` ngoài nhóm
  tab. Tồn kho: `/catalog/inventory` (tồn), `moves`, `transfers`, `counts`, `lots`, `purchasing`,
  `suppliers`. Chi tiết một dòng của bảng mở bằng `?open=<id>` thành một dòng mở rộng ngay dưới
  (Server Component, không cần JavaScript), như khung chi tiết của bản thiết kế.
- Dữ liệu mẫu: `src/sample/catalog.ts` (sản phẩm, biến thể, danh mục, thuộc tính, quy tắc hàng cấm /
  có điều kiện, giấy tờ, bảng giá, dòng giá, nhập / xuất, bản nháp AI), `src/sample/inventory.ts`
  (tồn, sổ biến động, chỗ giữ, chuyển kho, kiểm kê, lô, serial, nhà cung cấp, đơn đặt mua, phiếu
  nhập, trả hàng), `src/sample/tax.ts` (nhóm thuế và thuế suất có ngày hiệu lực của bước 36). ID cố
  định (`PRODUCT_ID`, `VARIANT_ID`, `PRICE_LIST_ID`, `SUPPLIER_ID`) và hàm đọc theo `catalog::api`
  (`variants`, `variantByCode`, `allVariants`, `pricesAt`, `resolvePrice`) để khuyến mại, đơn hàng,
  sàn làm sau dùng chung. Kho và cửa hàng lấy từ `listUnits()` của `sample/org.ts`.
- Mô hình theo đặc tả: dòng giá chỉ thêm, giải giá theo nút gần nhất → nhóm khách → ưu tiên, bảng
  không có dòng thì cửa hàng kế thừa bảng kế tiếp; `on_hand` luôn bằng tổng sổ biến động (mọi đổi số
  tồn đi qua một hàm, có test `verifyLevels`); kiểm kê lệch theo số lúc đếm, cộng vào tồn hiện tại;
  giá vốn bình quân gia quyền làm tròn nửa lên. Lệnh ghi nhạy với bấm lại (dòng giá, điều chỉnh tồn,
  phiếu nhập) nhận mã tham chiếu và trả bản cũ khi gửi lại.
- Tiền là `Money` như JSON của core (D-180 của core: `amount` là chuỗi). `formatMoney` nhận cả chuỗi
  và luôn viết đồng Việt Nam là số, khoảng trắng không ngắt (U+00A0) rồi "₫" ở mọi ngôn ngữ ("590,000
  ₫" bằng tiếng Anh), để giá không ngắt dòng giữa số và ký hiệu.
- Ảnh sản phẩm chọn từ thư viện media THẬT của core bằng bộ chọn ảnh dùng chung
  (`components/media/media-picker.tsx`); tệp hướng dẫn (PDF) của thuộc tính đồ bếp chọn từ
  `GET /api/v1/media?type=application/pdf` thật. Danh sách ảnh của sản phẩm lưu ở dữ liệu mẫu. Nút
  "Gợi ý mô tả bằng AI" chỉ bật khi `GET /ai/status` thật báo AI bật; bản nháp chỉ là gợi ý, áp dụng
  mới bật dấu `ai_assisted`.
- Nhập CSV hai bước: chạy thử (kiểm mọi dòng, không ghi) rồi nhập đúng nội dung vừa kiểm (giữ trong
  trạng thái của form). Xuất CSV qua route `/catalog/export.csv` của giao diện, chặn ô bắt đầu bằng
  `=` `+` `-` `@`.
- Chữ trên giao diện dưới `catalog.*` và `inventory.*`; mã lỗi của module dịch ở `<ns>.codes.*`, lỗi
  theo ô ở `<ns>.fields.*` (`src/lib/commerce-action.ts`), khi có API thì core tự dịch `detail`.
  Hộp thoại có form dùng chung `ActionDialog` / `ActionForm` (`components/catalog/action-dialog.tsx`).

Lý do: chủ dự án muốn thấy và thử đủ phân hệ thương mại theo bản thiết kế trong lúc team API làm bước
41–42 (W-006); một bộ dữ liệu có ID cố định để các phân hệ sau trỏ đúng sản phẩm.

Đã cân nhắc: khung chi tiết bên phải như bản thiết kế — cần JavaScript và khó dùng trên điện thoại;
dòng mở rộng bằng `?open=` mở thẳng được và nút quay lại chạy đúng. Gộp Tồn kho vào màn Sản phẩm như
một tab — hai nhóm người dùng khác nhau (danh mục và giá / kho và thu mua), mỗi bên nhiều tab.

## W-014 · Mặt điều khiển nền tảng: không gian riêng của nhân sự vận hành (dữ liệu mẫu) — 2026-11-15 — agent quyết

Quyết định:

- Khung có hai **không gian** (`Workspace` ở `src/nav/nav.ts`): `tenant` (mặc định, sổ `NAV`) và
  `platform` (sổ `NAV_PLATFORM`, mọi đường dẫn dưới `/platform`). Không gian chọn bằng **route group**:
  `(admin)` cho không gian khách, `(platform)` cho mặt điều khiển, mỗi group một layout gọi chung
  `AdminShell` (`src/components/shell/admin-shell.tsx`, phần thân cũ của layout `(admin)`) với
  `workspace`. Không trộn mục của hai sổ; `workspaceOf(pathname)` và `navOf(workspace)` có test.
- Mặt điều khiển khác hẳn không gian khách: thanh bên bảy mục theo `RAIL_PLATFORM` của bản thiết kế
  (Khách hàng, Gói và giá, Thuê bao, Cấp phát, Đội database, Sức khoẻ, Vào dữ liệu khách), mỗi mục
  một nhóm một màn nên không có menu con; nhãn "Nền tảng" cạnh tên trên thanh bên; đầu trang có ô
  "Nền tảng Autoxide · Mặt điều khiển · nhân sự vận hành" và nút khiên mở lời nhắc "Bạn không thấy
  dữ liệu nghiệp vụ của khách…"; thanh đáy điện thoại riêng (Khách hàng · Vận hành · Tìm · Phân hệ).
  Menu tài khoản và bảng lệnh có lối "Mặt điều khiển nền tảng" / "Về không gian của khách"; lối sang
  mặt điều khiển chỉ hiện khi người xem thấy ít nhất một màn của nó.
- Ai thấy: mỗi màn theo permission dự kiến của nhân sự vận hành trong đặc tả — `kernel.tenants.read`
  (33), `plans.plans.read`, `plans.subscriptions.read`, `plans.provision` (35), `kernel.placements.read`
  (33), `kernel.ops.read` (39), `auth.support.grant` (34); admin thấy hết. Core còn đòi người gọi thuộc
  khách nền tảng (`tenant_platform_only`); giao diện chưa biết khách của người đăng nhập (chờ
  `GET /kernel/tenant` của bước 33) nên chỉ lọc theo permission.
- Cả không gian là dữ liệu mẫu (W-006): `src/sample/platform-data.ts` (kiểu, kho), `platform.ts`
  (khách, placement, cấp phát, xuất dữ liệu, quyền vào hỗ trợ, sức khoẻ), `platform-plans.ts` (gói,
  giá, ghi đè, thuê bao, kỳ thanh toán, mức dùng). Một bộ dữ liệu: khách "Bếp Mộc" là khách của không
  gian khách — thuê bao, kỳ thanh toán, hạn mức đọc và đổi thẳng ở `settings.ts`; quyền vào hỗ trợ
  đọc và ghi vào sổ của `org.ts` (khách thấy ngay ở Phân quyền › Quyền vào hỗ trợ, và tắt hỗ trợ ở
  phía khách thì nền tảng chỉ cấp được theo yêu cầu của cơ quan); gói Khởi đầu, Doanh nghiệp, Thêm
  100 GB dùng đúng id và giá của `settings.ts` (thêm `SAMPLE_PLAN_IDS`, `operatorSetSubscription`,
  `operatorMarkPaid`, `recordSupportGrant` — chỉ thêm). Gói "Cơ bản" của bản thiết kế là "Khởi đầu"
  ở đây cho khớp màn Cài đặt; tên miền mẫu dùng đuôi `.example`.
- Việc core làm bằng job (cấp phát từng bước, migrate, dời khách, xuất dữ liệu) tiến theo thời gian
  thật mỗi lần đọc (`syncPlatform`, mỗi bước 3 giây). Cấp phát database riêng dừng ở bước chuẩn bị
  database ở lần chạy đầu (URL kết nối chỉ khai bằng CLI) để thấy được "Thử lại".
- **Luôn chạy thử trước**: migrate (một placement hay cả đội) và dời khách chỉ chạy thật sau một lần
  chạy thử còn hiệu lực (30 phút); kết quả chạy thử hiện trên trang (kho ghi lại, như kết quả của job),
  nút chạy thật hỏi lại và nêu hệ quả; migrate cả đội còn phải gõ "migrate". Thao tác không đảo được
  (tạm khoá hẳn, xuất dữ liệu, huỷ thuê bao, đặt chỉ đọc, ngừng bán gói, tắt giá, migrate, dời khách)
  có hộp xác nhận nêu từng hệ quả; tạm khoá hẳn cần lý do và ô "tôi hiểu". Bật / tắt module cho một
  khách là ghi đè `module` (bắt buộc lý do), báo kèm Hoàn tác; bỏ ghi đè cũng có Hoàn tác.
- Chi tiết khách là trang riêng `/platform/tenants/{id}` (thay khung trượt của bản thiết kế): mở thẳng
  được, chạy đúng trên điện thoại. Thao tác thuê bao (`SubscriptionActions`) dùng chung cho màn Thuê
  bao và trang chi tiết khách. Gói và giá có hai tab (`/platform/plans`, `/platform/plans/overrides`),
  chi tiết gói ở `/platform/plans/{id}`.
- Khoá kho mẫu trên `globalThis` mang số phiên bản (`autoxide.sample.platform.2`): đổi dữ liệu ban đầu
  thì tăng số, máy chủ dev đang chạy không giữ kho cũ.

Lý do: chủ dự án giao dựng mặt điều khiển cho nhân sự vận hành theo bản thiết kế `Platform` và
`PlatformOps`, khác hẳn không gian của khách. Route group là cách đơn giản nhất để mỗi không gian có
layout riêng mà không lặp code khung; luật "chạy thử trước" và "gõ lại để xác nhận" theo đặc tả bước 33
(đề xuất migrate bằng job) và bước 35.

Đã cân nhắc: một layout chọn sổ theo đường dẫn ở trình duyệt (`usePathname`) — layout của Server
Component không biết đường dẫn, phải đẩy cả đầu trang xuống client; khung trượt chi tiết khách như
bản thiết kế — không mở thẳng được và chật trên điện thoại; một màn "Vận hành nền tảng" sáu tab như
bản thiết kế — thanh bên đã có bảy mục, tab lặp lại thanh bên.

## W-015 · Khuyến mại và Vận chuyển (dữ liệu mẫu); mã đơn mẫu dùng chung — 2026-11-15 — agent quyết

Quyết định:

- Màn "Khuyến mại" `/marketing/promotions` đứng **đầu** nhóm Tiếp thị (`mkt`) như bản thiết kế
  (`sample: { step: "43" }`, permission `promotions.read`). Nhóm mới "Bán hàng" (`sales`, biểu tượng
  `cart`) đứng sau Tổng quan theo `RAIL_TENANT`, hiện có một màn "Vận chuyển" `/sales/shipping`
  (`sample: { step: "44" }`, hiện khi có một trong các permission của các tab). Màn "Đơn hàng" (bước 45)
  sẽ đứng đầu nhóm, trước Vận chuyển; Cửa hàng, Kênh bán theo sau. Cả hai màn dựng hoàn toàn bằng dữ
  liệu mẫu (W-006): tắt dữ liệu mẫu thì 404 (`commerceGate` của W-013).
- Mỗi tab một đường dẫn con. Khuyến mại: chương trình (kèm trần pháp luật đang hiệu lực và "Thử giỏ
  hàng"), `codes`, `flash`, `notice`, `versions`. Vận chuyển: vận đơn, `rates`, `calendar`, `cod`,
  `carriers`; tab theo permission dự kiến của đặc tả 44; người không xem được vận đơn vào thẳng tab đầu
  tiên mình xem được. Chi tiết một dòng mở bằng `?open=<id>` (như W-013).
- Dữ liệu mẫu: `src/sample/promotions.ts` (chương trình, mã, flash sale, phiên bản chỉ thêm, dữ liệu luật
  `legal_limits` / `notice_rules` có ngày hiệu lực và cờ `needs_review`, hàm tính `evaluateWith` theo thứ
  tự của đặc tả 43), `src/sample/shipping.ts` (vận đơn, kiện, hành trình, phương thức kế thừa theo cây,
  vùng, bậc phí, điểm nhận, lịch giao có ngày hiệu lực, ngày nghỉ, hãng, bảng kê và dòng lệch COD). Sản
  phẩm, biến thể, giá lấy từ `sample/catalog.ts` (`variants`, `variantByCode`, `pricesAt`; thêm
  `CATEGORY_ID`), cửa hàng từ `sample/org.ts`.
- Mã đơn mẫu dùng chung ở `src/sample/order-refs.ts` (`ORDER_REFS`, `orderByNumber`, mã
  `BM-2611-0xxx` như bản thiết kế): vận đơn và dòng bảng kê trỏ tới đây; bộ dữ liệu đơn hàng (bước 45)
  dựng sau phải dùng đúng các mã và ID này.
- Luật (D-186 của core): trần mức giảm và quy tắc thông báo là dữ liệu có ngày hiệu lực, hiện kèm căn
  cứ và "cần đối chiếu văn bản gốc"; không có dòng luật hiệu lực, hay thiếu giá ngay trước khuyến mại,
  thì chặn (không tự cho qua). Chưa ghi nhận đã nộp thông báo thì **chặn** bật (khuyến nghị của đặc tả
  43). Hồ sơ thông báo chỉ xuất dữ liệu (CSV chặn công thức, JSON) qua route của giao diện; người nộp là
  con người. COD: hệ thống chỉ ghi nghĩa vụ và đối soát, nêu rõ tiền về đâu (D-187).
- "Thử giỏ hàng" trả thêm `skipped` (dự kiến): chương trình không áp và vì sao, cùng `rejected_codes`;
  lý do là `code` + `params`, giao diện dịch ở `promotions.why.*`. Ngày giao dự kiến là khoảng
  `eta_from` / `eta_to` (ngày theo giờ Việt Nam), tính bằng hàm thuần `etaFor` (`src/lib/shipping.ts`)
  từ giờ chốt, ngày làm việc, ngày nghỉ. Khung giờ khuyến mại nhập và hiện theo giờ Việt Nam (giờ của cửa
  hàng, đặc tả 43).
- Thao tác đảo được (tạm dừng / chạy lại chương trình, bật / tắt phương thức giao, bật / tắt hãng) có
  Hoàn tác (`ChangeButtons`). Thao tác về tiền hay không đảo được (bật chương trình, kết thúc sớm, huỷ,
  đặt hãng, huỷ vận đơn, giao lại, hoàn hàng, nhận hàng hoàn, bàn giao, khớp dòng lệch) hỏi lại và nêu
  hệ quả; sửa giá sốc là hộp thoại nêu giá trước khuyến mại và giá thấp nhất được phép. Khoá API của
  hãng không bao giờ được lưu ở dữ liệu mẫu hay điền lại vào form (chỉ ghi lúc đặt khoá).
- `ActionDialog` (`components/catalog/action-dialog.tsx`) báo xong ngay khi Server Action trả về thay vì
  đợi effect: nút mở hộp thoại có thể nằm trên dòng biến mất sau thao tác (hồ sơ "chờ nộp" → "đã nộp",
  dòng lệch "chưa xử lý" → "đã xử lý"), effect không kịp chạy nên mất câu báo. Cách gọi không đổi.
- Chữ dưới `promotions.*`, `shipping.*` (mã lỗi ở `<ns>.codes.*`, lỗi theo ô ở `<ns>.fields.*` qua
  `lib/commerce-action.ts`), cộng `nav.groups.sales`, `nav.pages.{promotions,shipping}`,
  `nav.about.{promotions,shipping}`.

Lý do: chủ dự án muốn thấy và thử đủ phân hệ thương mại theo bản thiết kế trong lúc team API làm bước
43–44 (W-006); một bộ mã đơn chung để màn Đơn hàng sau này khớp với vận đơn và đối soát.

Đã cân nhắc: đặt "Thử giỏ hàng" thành tab riêng — bản thiết kế đặt nó ở tab Chương trình và ở nút đầu
trang; giữ vậy, nút đầu trang nhảy tới khối đó. Dựng nhóm Bán hàng chờ có Đơn hàng — Vận chuyển dùng
được độc lập (đặc tả 44: `shipping` không phụ thuộc `orders`). Thêm nút "Chợ Bếp Mộc" vào cây tổ chức
mẫu cho phương thức "Sàn giao" — sàn là bước 46; bỏ phương thức đó, giữ ghi chú COD trên sàn.

## W-016 · Phân hệ Tài chính: màn "Kế toán" (dữ liệu mẫu) — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Tài chính (`finance`, biểu tượng `wallet`) vào sổ điều hướng, đứng sau Nội dung và trước Tổ
  chức theo thứ tự `RAIL_TENANT` của bản thiết kế. Một màn "Kế toán" `/finance` (`sample: { step: "36" }`)
  hiện khi người xem có một trong `ledger.read`, `invoices.read`, `tax.read`, `invoices.export`
  (permission dự kiến của đặc tả bước 36, khai ở `src/lib/finance.ts`). Tắt dữ liệu mẫu thì màn trả 404.
- Tám tab, mỗi tab một đường dẫn con, theo thứ tự của bản thiết kế: Sổ cái (`/finance`), Hàng chờ sai
  lệch (`exceptions`), Tài khoản ngân hàng (`bank`), Hoá đơn điện tử (`einvoices`), Ký hiệu và uỷ nhiệm
  (`series`), Thuế (`tax`), Kỳ kế toán (`periods`), Xuất kế toán (`export`). Tab chỉ hiện khi có permission
  đọc của nó; `/finance` chuyển sang tab đầu tiên người xem dùng được khi thiếu `ledger.read`. Chi tiết
  một dòng mở bằng `?open=<id>` thành dòng mở rộng ngay dưới, như W-013.
- Dữ liệu mẫu theo ba module của đặc tả: `src/sample/finance.ts` (`ledger`: sổ, tài khoản theo mục đích,
  bút toán, chuỗi băm, kỳ, cân đối thử, thanh toán, hàng chờ sai lệch, lần đối soát, tài khoản ngân hàng,
  VietQR), `src/sample/finance-invoices.ts` (`invoices`: chứng từ, ký hiệu, uỷ nhiệm, bản xuất), và phần
  thêm cuối `src/sample/tax.ts` (`tax`: khấu trừ thay, quy tắc có ngày hiệu lực, gói dữ liệu, hồ sơ thuế
  theo nút, tính thử) — chỉ thêm, không đổi khoá cũ. Một bộ dữ liệu: nút từ `org.ts` (`SAMPLE_UNIT_IDS`),
  sản phẩm trên hoá đơn từ `catalog.ts` (`VARIANT_ID`), thuế suất từ `tax.ts`, lỗi kết nối nhà cung cấp hoá
  đơn đọc từ `settings.ts`. Mã đơn `BM-2611-04xx` khai ở `FINANCE_ORDER_REFS` (`finance.ts`); khi gộp với
  `sample/order-refs.ts` của phân hệ Bán hàng thì trỏ về đó.
- Giữ đúng luật của core trong hàm mẫu: tiền là số nguyên đồng + mã tiền tệ; bút toán chỉ thêm, sai thì
  đảo (một lần), tổng Nợ = tổng Có (`ledger.unbalanced`), kỳ khoá theo thứ tự tháng và không mở lại,
  `reference` gửi lại cùng nội dung trả bản cũ (D-184); chuỗi băm `ledger-v1` không gồm `tenant_id`, kiểm
  toàn vẹn tính lại thật; số hoá đơn chỉ cấp khi phát hành, không nhảy số, gửi lại cùng số khi bị trả
  lỗi; hoá đơn đã có mã chỉ sửa bằng chứng từ liên kết; chứng từ đã phát hành không xoá được (lưu 10 năm);
  tách thuế từ giá gồm thuế làm tròn một lần bằng số nguyên lớn (không qua số thực). Core không giữ tiền
  (D-187): màn chỉ đối chiếu sổ với sao kê; đối soát COD nằm ở màn Vận chuyển, ở đây chỉ dẫn sang
  `/sales/shipping`.
- Mỗi kỳ có phần phát sinh gộp (để số liệu như một chuỗi đang chạy) cộng với bút toán chi tiết; cân đối
  thử và GTGT đầu ra / đầu vào theo kỳ cộng cả hai, có test giữ hai cột luôn cân.
- Việc core làm bằng job tiến theo thời gian thật mỗi lần đọc: niêm phong 10 giây, nhà cung cấp trả mã
  sau 4 giây, bản xuất xong sau 5 giây, lần đối soát xong sau 4 giây.
- Điểm luật là dữ liệu có ngày hiệu lực kèm văn bản (`TaxRule`, hiện bằng `TaxBasis`): hoá đơn khi giao
  hàng, xử lý sai sót, uỷ nhiệm, ngưỡng máy tính tiền, lưu trữ 10 năm, ánh xạ số hiệu tài khoản, chuẩn
  VietQR, thu hộ cần giấy phép; chưa chắc thì ghi "cần đối chiếu văn bản gốc".
- Ba form có phần chạy ở trình duyệt (`components/finance/forms.tsx`): ghi bút toán tay nhiều dòng, cộng
  Nợ / Có ngay khi gõ (Server Action vẫn kiểm lại); thử mã VietQR (chuỗi EMVCo + CRC-16, ảnh QR vẽ ở máy
  chủ bằng `qrPath`); tính thử thuế. Mọi hộp thoại khác dùng `FormDialog` / `InlineForm` / `ConfirmAction`.
  Khoá sổ phải gõ lại tên kỳ. `commerce-action.ts` nhận thêm namespace `finance` (chỉ thêm).
- Tải bản xuất qua route `/finance/export/{id}/download` của giao diện (CSV UTF-8 có BOM, chặn công thức
  bằng `csvCell` của `catalog.ts`); XLSX chờ API.
- Khoá kho mẫu trên `globalThis` mang số phiên bản (`autoxide.sample.finance.1`,
  `autoxide.sample.finance-invoices.1`).

Lý do: chủ dự án muốn dựng đủ phân hệ theo bản thiết kế `Finance` trong lúc team API làm bước 36 (W-006);
luật số hai của core đòi điểm luật hay đổi là dữ liệu có ngày hiệu lực và ghi căn cứ.

Đã cân nhắc: bút toán tay hai ô (một Nợ, một Có) như bản thiết kế — luôn cân nên không thử được kiểm Nợ =
Có, và bút toán thật hay nhiều dòng; khung chi tiết bên phải — như W-013, dòng mở rộng mở thẳng được;
tách Thuế và Hoá đơn thành màn riêng — bản thiết kế và nhóm người dùng (kế toán) là một màn tám tab.

## W-017 · Đơn hàng và Cửa hàng (dữ liệu mẫu, chờ API bước 45); bộ đơn mẫu khớp mọi phân hệ — 2026-11-15 — agent quyết

Quyết định:

- Nhóm "Bán hàng" (`sales`) theo thứ tự: "Đơn hàng" `/sales/orders`, "Vận chuyển" (có sẵn), "Cửa hàng"
  `/sales/stores`; cả hai màn mới `sample: { step: "45" }`, hiện khi có một trong các permission dự kiến
  của đặc tả 45 (`src/lib/orders.ts`): Đơn hàng — `orders.read`, `orders.returns.manage`,
  `orders.pos.sell`; Cửa hàng — `orders.manage`, `orders.pos.shift`, `orders.returns.manage`,
  `orders.reviews.moderate`. Tắt dữ liệu mẫu thì 404 (`commerceGate` của W-013). Kênh bán (bước 48)
  dựng sau.
- Tab là đường dẫn con. Đơn hàng: `/sales/orders` (danh sách), `returns`, `pos`, `carts` trong route
  group `(tabs)`; chi tiết đơn là **trang riêng** `/sales/orders/{id}` (mở thẳng được, dùng được trên
  điện thoại), cùng `/{id}/receipt` (xem trước hoá đơn từ máy tính tiền), `/print` (phiếu giao),
  `/export.csv`. Cửa hàng: `/sales/stores` (nhận tại cửa hàng), `shifts`, `returns`, `reviews`; chi tiết
  một dòng mở bằng `?open=` như W-013. Bảng đổi trả dùng chung một component cho hai màn
  (`components/orders/returns-view.tsx`), Cửa hàng lọc `return_method = in_store`.
- Dữ liệu mẫu: `src/sample/orders.ts` (đơn, dòng, thuế, khuyến mại, thanh toán, hoàn tiền, lịch sử
  trạng thái, ghi chú, đổi trả, giỏ bỏ dở, view đã lưu, nhận tại cửa hàng, hàm tính bút toán `ledgerOf`)
  và `src/sample/stores.ts` (ca thu ngân, bán tại quầy, đánh giá, bản nháp tóm tắt AI). Một bộ dữ liệu
  cho cả ứng dụng:
  - mỗi mã của `sample/order-refs.ts` có một đơn viết tay; thêm các mã màn Tài chính và Cửa hàng trỏ
    tới (0317, 0350, 0379, 0380, 0386, 0390, 0395, 0398, 0401, 0405, 0406, 0408, 0409, 0411, 0413,
    0416, 0419) theo thứ tự tăng dần. ID sinh theo vị trí nên đổi; mọi chỗ trỏ tới đơn đều dùng mã
    (`orderId`), không chép ID;
  - giá từ `pricesAt` của `sample/catalog.ts`, khuyến mại tính bằng `evaluateCart` của
    `sample/promotions.ts` lúc dựng đơn (BEPMOC10, miễn phí giao từ 1.000.000 ₫, quà khăn bếp), thuế GTGT
    theo `sample/tax.ts` (thuế suất có ngày hiệu lực) tính trên từng dòng; giá, giảm và thuế chụp vào dòng
    đơn lúc đặt;
  - món và tiền COD của vận đơn ở `sample/shipping.ts` khớp đơn (test kiểm). Vì vậy **sửa số COD** của
    6 vận đơn và dòng bảng kê tương ứng (0331, 0352, 0362, 0388, 0396, 0415) cho bằng tổng đơn (tiền
    hàng − giảm + phí giao người mua trả); test bảng kê của Vận chuyển đổi số theo;
  - "412 đơn trong 30 ngày, 37 chờ xử lý" là số đếm thật: các số BM-2611-0008…0419 không viết tay được
    sinh bằng bộ sinh số cố định (cùng kết quả mỗi lần khởi động), giờ đặt tăng theo số; số chờ xử lý bù
    bằng các đơn sinh gần nhất. Tạo đơn tại quầy thì số tăng lên 413 — vẫn khớp nhau.
- Trạng thái đơn theo bảng chuyển của đặc tả 45, thêm `awaiting_acceptance` (dự kiến, "chờ cửa hàng /
  người bán nhận đơn", mục H2 của `ui-trace-roadmap.md`). Mọi chuyển đi qua một hàm kiểm bảng
  (`TRANSITIONS`, `orders.invalid_transition`), có kiểm phiên bản (`expect` = `updated_at`, 412). **Hoàn
  tác** chuyển trạng thái của nhân viên (nhận đơn, bắt đầu chuẩn bị, tự giao, báo sẵn sàng, xác nhận
  hàng loạt) trong 15 phút là dự kiến (đặc tả chưa có chiều ngược), không áp cho giao xong, huỷ, hoàn
  tất. Huỷ đơn đã thu tiền tự tạo hoàn tiền toàn phần.
- Tiền (D-187 của core): mỗi đơn nêu dòng tiền (tự thu qua cổng / VietQR, thu hộ qua đối tác có giấy
  phép cho đơn sàn, thu khi giao, tiền mặt tại quầy) và nơi tiền về khi hoàn. Hoàn tiền (một phần hay
  toàn bộ, duyệt đề xuất của agent, hoàn theo đổi trả) luôn qua hộp xác nhận nêu số tiền, đơn, người
  mua, nơi tiền về, permission và "không hoàn tác được"; nút Huỷ nhận con trỏ khi hộp mở; mỗi lần mở
  hộp một mã tham chiếu (gửi lại không hoàn hai lần). Bút toán tính từ trạng thái đơn theo bảng "Chỗ dễ
  sai" của đặc tả 45 (thu → người mua trả trước; giao → doanh thu, GTGT đầu ra, phí giao; hoàn → bút
  toán đảo; đơn sàn không ghi doanh thu của người bán); test kiểm nợ = có cho mọi đơn.
- "Hỏi bằng lời": chỉ bật khi `GET /ai/status` thật báo AI bật; phần hiểu câu là mẫu của
  `POST /ai/filters/parse` (bước 52, luật từ khoá tiếng Việt có / không dấu và tiếng Anh). Kết quả là chip
  sửa được / bỏ được, bấm Áp dụng mới đổi địa chỉ trang; phần không hiểu hiện riêng. Core giả của e2e có
  `POST /__ai` để bật AI khi thử.
- View đã lưu (của hệ thống, của nút, của tôi) là dữ liệu mẫu (bước 52), so bằng chuỗi truy vấn chuẩn
  (`filterQuery`); số trên chip là số đếm thật của bộ lọc. Thao tác hàng loạt: ô chọn trong bảng do máy
  chủ dựng, `BulkForm` (client) chỉ đếm ô đã chọn, hiện thanh cố định ở đáy (xác nhận có Hoàn tác, in phiếu
  giao, chọn cả mọi đơn khớp bộ lọc). Trên điện thoại mỗi đơn là một thẻ: mã và tổng ở dòng đầu; cột
  Tổng dính phải khi bảng cuộn ngang.
- Bán tại quầy cần ca đang mở (`orders.shift_not_open`), không vượt tồn bán được của cửa hàng (đọc từ
  `sample/inventory.ts`, phần đã bán trong phiên trừ ở `sample/stores.ts`); tạo đơn rồi mở bản xem trước
  hoá đơn để in bằng trình duyệt (`@media print` ẩn khung). Giỏ bỏ dở chỉ nhắc người mua đã đồng ý nhận
  tin, tối đa 2 lần, hoàn tác được tới lúc gửi. Nhận tại cửa hàng: nhân viên không bao giờ thấy mã nhận
  (hàm mẫu không trả mã); bàn giao so mã, người nhận hộ phải khớp tên đã khai. Đánh giá: chỉ ẩn với lý do
  trong danh sách (`orders.moderation_reason_invalid`), mở lại được; tóm tắt AI là bản nháp chờ duyệt.
- Chữ dưới `orders.*` và `stores.*`; mã lỗi dịch ở `orders.codes.*`, lỗi theo ô ở `orders.fields.*`
  (`Namespace` của `lib/commerce-action.ts` thêm `orders`).

Lý do: chủ dự án muốn thấy và thử đủ phân hệ Bán hàng theo bản thiết kế trong lúc team API làm bước 45
(W-006); các phân hệ đã dựng (Vận chuyển, Khuyến mại, Tài chính) và màn Đơn hàng phải kể cùng một câu
chuyện về cùng một đơn.

Đã cân nhắc: khung chi tiết bên phải như bản thiết kế — trang riêng mở thẳng được và dùng tốt trên điện
thoại; giữ số COD cũ của Vận chuyển và cho đơn lệch — sai luật "dữ liệu mẫu nhất quán"; chỉ hiện "412" là
số viết cứng — số trên view và danh sách sẽ không khớp nhau; tạo vận đơn từ màn Đơn hàng bằng cách gọi
thẳng kho mẫu của Vận chuyển — đặc tả 45 đi qua event `orders.fulfillment_requested`, nên màn Đơn hàng
chỉ dẫn sang Vận chuyển.

## W-018 · Phân hệ Sàn: "Vận hành sàn" và Trung tâm người bán, không gian thứ ba (dữ liệu mẫu) — 2026-11-15 — agent quyết

Quyết định:

- Phân hệ Sàn (`market`, biểu tượng `store`) vào sổ điều hướng giữa Nội dung và Tài chính, đúng thứ tự
  `RAIL_TENANT` (Khách hàng của bước 47 sẽ đứng ngay trước). Một màn "Vận hành sàn" `/market`
  (`sample: { step: "46" }`) hiện khi có một trong các permission dự kiến của đặc tả 46 (khai ở
  `src/lib/market.ts`). Năm tab, mỗi tab một đường dẫn con và một permission: Người bán (`/market`,
  `marketplace.sellers.read`), Duyệt sản phẩm (`listings`, `marketplace.listings.review`), Phí sàn
  (`fees`, `marketplace.fees.manage`), Chi trả (`payouts`, `marketplace.finance.read`), Tranh chấp
  (`disputes`, `marketplace.disputes.resolve`). Chi tiết một dòng mở bằng `?open=` như W-013.
- **Không gian thứ ba `seller`** (mở rộng `Workspace` của W-014, chỉ thêm): route group `(seller)`, mọi
  đường dẫn dưới `/seller`, sổ `NAV_SELLER` năm mục theo `RAIL_SELLER` (Tổng quan, Đơn, Sản phẩm, Gian
  hàng, Tiền), nhãn "Người bán" cạnh tên, đầu trang là gian hàng đang xem, thanh đáy điện thoại riêng
  (Gian hàng · Tiền · Tìm · Phân hệ). `navOf` / `workspaceOf` nhận thêm `seller`; `AdminShell` nhận
  `context` (tên gian hàng) và có lối sang các không gian khác dưới dạng danh sách. Trang: các bước để
  được bán (`/seller`), đơn của tôi và tranh chấp (`/seller/orders`, `…/disputes`), sản phẩm và trạng
  thái duyệt (`/seller/products`), gian hàng và điểm vi phạm (`/seller/shop`, `…/performance`), đối soát
  và chi trả kèm sao kê CSV (`/seller/money`, route `/seller/money/statement.csv`).
- **Ai thấy gian hàng nào** (`sellerContext`, `src/lib/seller.ts`): người bán thật là người có
  `marketplace.sell` ghi rõ trong role (không tính "mọi permission" của admin) — core sẽ trả gian hàng
  của nút mình qua `GET /sellers/me`; dữ liệu mẫu chưa biết người đăng nhập thuộc nút nào nên trả gian
  hàng mẫu đầu tiên. **"Xem như người bán"** là lối thử của người có `marketplace.sellers.read`, tách
  khỏi quyền thật: chọn gian hàng (nút trên màn Vận hành sàn, bộ chọn khi vào `/seller`), id nút giữ
  trong cookie `ax_seller_view` (httpOnly, 8 giờ, xoá khi đăng xuất, không phải secret); không cấp
  permission nào, băng trên cùng nói rõ là chế độ thử, có đổi gian hàng và thoát. Thao tác trong chế độ
  này chỉ đổi dữ liệu mẫu; **khi có API thì chế độ này chỉ để xem** (đọc `GET /sellers/{org_id}`,
  `/settlements?seller=`, `/disputes?seller=`), vì core không có cơ chế mạo danh — lệnh ghi của người
  bán cần phiên của chính người bán.
- **Gắn với Tuân thủ mẫu thật**: KYC của người bán đọc từ sổ KYC của `compliance.ts` (hoạt động `sell`,
  hồ sơ còn hạn thắng hồ sơ mới đang chờ), văn bản đã chấp nhận đọc từ `compliance-records.ts` (bản cần
  có là bản hiệu lực mới nhất có "đòi chấp nhận lại"). Một hàm quyết "được bán không" (`gateOf`, như
  `SellerGate::ensure_can_sell`): đang bán VÀ KYC còn hạn VÀ đã chấp nhận quy chế sàn và hợp đồng người
  bán VÀ đủ giấy tờ ngành có điều kiện (quy tắc hàng có điều kiện của `catalog.ts`). Mỗi lần đọc chạy
  việc core làm khi nghe event: KYC hết hạn hay văn bản mới chưa chấp nhận → tự tạm khoá kèm lý do; điều
  kiện đủ lại → **tự mở lại** (chỉ với tạm khoá tự động; tạm khoá do người quyết phải "Mở lại"). Duyệt KYC
  ở màn Tuân thủ đổi ngay tình trạng ở đây. Chỉ thêm vào hai file Tuân thủ: ba hồ sơ KYC cũ (Gốm Sứ còn
  hạn, Gia Dụng Nhà Na hết hạn, Bếp Nhà Thỏ để bán), năm lần chấp nhận văn bản, `acceptanceOf` và
  `recordAcceptance`.
- **Tiền (D-187)**: sàn không giữ tiền; màn nói rõ tiền nằm ở tài khoản thu hộ của đối tác có giấy phép,
  sàn chỉ gửi lệnh chi (căn cứ `payments.no_custody` của `tax.ts`). Quyết toán `net = gross + subsidy −
  phí − khấu trừ thay`, hoa hồng theo dòng phí hiệu lực tại ngày đặt (ngành gần nhất thắng mặc định),
  thuế GTGT của phí tách từ phí đã gồm thuế (thuế suất chuẩn của `tax.ts`), khấu trừ thay GTGT / TNCN chỉ
  cho hộ và cá nhân kinh doanh theo tỉ lệ có ngày hiệu lực của `tax.ts` (NĐ 117/2025, cần đối chiếu văn
  bản gốc) — số của bản thiết kế (690.000 ₫ → 638.250 ₫; 24.600.000 ₫ → 22.755.000 ₫) và bút toán đơn
  BM-2611-0350 của sổ Chợ Bếp Mộc (`finance.ts`) khớp nhau, có test. Người bán chưa đủ điều kiện thì đợt
  chi "tạm giữ" và gửi bị chặn (`marketplace.seller_not_active`); chi lại dùng cùng `reference`; đối tác
  báo kết quả sau 4 giây (tài khoản sai tên chưa sửa thì lỗi lại). Số tài khoản nhận tiền chỉ đi qua form
  một lần, dữ liệu mẫu chỉ giữ 4 số cuối, không điền lại.
- Phí sàn là dữ liệu có ngày hiệu lực, chỉ thêm: dòng mới từ ngày mai trở đi, dòng đang mở cùng loại và
  phạm vi tự đóng vào ngày trước đó; dòng chờ hiệu lực huỷ được (dòng cũ mở lại).
- Hộp xác nhận nêu hệ quả cho việc về tiền hay không đảo được: duyệt hồ sơ, chấm dứt (thêm ô "tôi hiểu"),
  gỡ sản phẩm, thêm dòng phí, huỷ dòng phí, gửi / chi lại lệnh chi, phân xử (ô "tôi hiểu tiền hoàn không
  hoàn tác được"), người bán đồng ý hoàn, gửi hồ sơ, chấp nhận văn bản. Việc đảo được có Hoàn tác: tạm
  khoá ↔ mở lại (`FormDialog` + `undoAction`), duyệt sản phẩm ↔ về "chờ duyệt" (`ChangeButtons`). Mọi
  biểu mẫu gom lỗi một lần, lỗi dưới từng ô, mã lỗi `marketplace.*` dịch ở `market.codes.*` /
  `market.fields.*` (`commerce-action.ts` nhận thêm namespace `market`, chỉ thêm).
- Dữ liệu mẫu: `src/sample/market-data.ts` (kiểu theo bảng của đặc tả 46, dữ liệu ban đầu) và
  `src/sample/market.ts` (hàm đọc / ghi, hàm tính thuần có test). Người bán là sáu nút `seller` của
  `org.ts` (bản thiết kế có "Đồ Gỗ Mộc Lan", cây mẫu không có, nên dùng người bán sẵn có); sản phẩm của
  người bán là lượt duyệt kèm tóm tắt (catalog mẫu chỉ có sản phẩm của Bếp Mộc). Mã đơn trên sàn ở
  `MARKET_ORDER_NUMBERS` (đơn đã có trong `order-refs.ts` dùng đúng ID ở đó); bộ đơn hàng (bước 45) dựng
  sau nên dùng đúng các mã này. Khoá kho mẫu `autoxide.sample.market.2`; lỗi lúc dựng kho không bị giữ lại.
- Sửa chung (chỉ thêm): ô chọn của `FormDialog` / `InlineForm` mang `key` theo giá trị vừa gửi, vì React
  đặt lại form sau mỗi lần gửi và ô chọn quay về lựa chọn đầu tiên — báo lỗi xong lựa chọn không mất.

Lý do: chủ dự án giao dựng phân hệ Sàn và Trung tâm người bán theo bản thiết kế `Market` và
`SellerCenter` trong lúc team API làm bước 46 (W-006). Luật TMĐT 122/2025, Điều 17 đòi xác thực người
bán trước khi cho bán, nên điều kiện bán đọc thẳng từ Tuân thủ thay vì giữ một bản sao.

Đã cân nhắc: Trung tâm người bán là một màn trong không gian khách — người bán chỉ được thấy nút của
mình, bản thiết kế dùng thanh bên rút gọn riêng; giữ trạng thái KYC riêng trong dữ liệu sàn — hai nguồn
sự thật, duyệt KYC ở Tuân thủ không đổi được tình trạng bán; "Xem như người bán" bằng cách cấp tạm
`marketplace.sell` — trộn quyền thử với quyền thật, đúng điều giao việc yêu cầu tránh; thêm người bán
"Đồ Gỗ Mộc Lan" vào cây mẫu — đổi số liệu của Cây tổ chức và Tuân thủ đã có test.

## W-019 · Khách hàng, Kênh bán, Tiếp thị liên kết (dữ liệu mẫu, chờ API bước 47–49) — 2026-11-15 — agent quyết

Quyết định:

- Sổ điều hướng (chỉ thêm, đúng `RAIL_TENANT` của bản thiết kế): nhóm mới `buyers` "Khách hàng" (biểu
  tượng `user`) ngay sau Nội dung, một màn `/customers`; "Kênh bán" `/sales/channels` cuối nhóm Bán hàng;
  "Tiếp thị liên kết" `/marketing/affiliate` cuối nhóm Tiếp thị. Cả ba `sample: { step }` (47, 48, 49), hiện
  khi có một trong các permission dự kiến của đặc tả (`src/lib/customers.ts`, `channels.ts`, `affiliate.ts`);
  tắt dữ liệu mẫu thì 404 (`commerceGate`). Tab là đường dẫn con, chi tiết một dòng mở bằng `?open=` (W-013).
  - Khách hàng: Hồ sơ khách, Tài khoản người mua (bước 34, nhãn riêng), Nhóm khách, Điểm và hạng, Giỏ bỏ
    dở, Giới thiệu bạn, Rủi ro COD (bước 45, nhãn riêng).
  - Kênh bán: Tài khoản kênh, Liên kết sản phẩm, Phân bổ tồn, Đơn cần xử lý, Đối soát, Báo cáo.
  - Tiếp thị liên kết: Đối tác, Quy tắc hoa hồng, Hoa hồng, Chi trả, Livestream, Góc người tiếp thị (xem
    trước màn của người có `affiliate.partner`, chỉ dữ liệu của chính họ).
- Một bộ dữ liệu cho cả ứng dụng:
  - `src/sample/channel-accounts.ts` (dữ liệu cố định, hàm thuần) giữ tài khoản kênh và liên kết sản phẩm
    gốc, dùng chung cho `orders.ts` và `channels.ts` (tránh phụ thuộc vòng). Đơn sinh của bộ đơn mẫu có số
    chia 3 dư 1, ở cửa hàng có tài khoản kênh, mọi dòng có liên kết đang bán, tài khoản đang chạy lúc đặt →
    đơn nhập từ kênh: `channel` = `shopee` / `tiktok_shop`, thêm `channel_account`, `external_ref` (đặc tả 45:
    `channel_account_id`, `external_ref`), dòng tiền `channel_collect` (đặc tả 48 `ChannelCollect`), giá dòng
    là giá kênh, không áp khuyến mại website. Đổi sau bước sinh số, không gọi thêm bộ sinh số, nên số đơn
    (412 trong 30 ngày, 37 chờ xử lý) và các đơn viết tay giữ nguyên. Bút toán đơn kênh: thu ghi phải thu kênh
    (`channel_receivable`), giao ghi doanh thu như đơn web. `CHANNELS` của `lib/orders.ts` thêm hai giá trị
    cuối danh sách.
  - Hồ sơ khách dựng từ người mua của đơn mẫu (lịch sử mua tính lại mỗi lần đọc nên hoàn tiền, đơn mới hiện
    ngay) và người có giỏ bỏ dở (đã đăng ký, chưa mua). Khách vãng lai tại quầy và người mua chỉ qua kênh bán
    ngoài không có hồ sơ (SĐT do kênh che, đặc tả 48: không dùng làm khoá người mua). Đơn trước cửa sổ 30
    ngày gộp một dòng "đơn trước đó" như bản thiết kế. Tổng chi = đơn hoàn tất − hoàn tiền (đặc tả 47).
  - "Đơn cần xử lý" là đơn thật có kênh của bộ mẫu, cộng ba đơn kênh gửi về chưa nhập được (hai thiếu ánh xạ,
    một nhập lỗi khi tài khoản TikTok Shop cần kết nối lại); đơn bán quá và xung đột đặt lên đơn có kênh chọn
    theo trạng thái. Ánh xạ xong thì nhập thành đơn mới qua `importChannelOrder` (thêm vào `orders.ts`, như
    `OrderIntake::import`: không trùng theo kênh + mã đơn trên kênh). Bảng kê đối soát dựng từ đơn kênh đã
    hoàn tất; "kênh còn nợ" = tiền kênh đã thu − dòng bảng kê đã ghi sổ (khớp sổ cái, test kiểm).
  - Hoa hồng tính từ đơn web thật: ghi nhận (`affiliate_attributions`, bảng của `affiliate`) cho đơn có số
    chia 6 dư 0 theo vòng người tiếp thị, và đơn đặt trong phiên livestream đã kết thúc (giờ phiên lấy theo
    một đơn để khớp nhau). Cơ sở tính = tiền dòng sau giảm, chưa thuế (chụp trong dòng đơn); trạng thái
    theo trạng thái đơn; quy tắc tra theo ngày đặt (sản phẩm > danh mục > mặc định theo ưu tiên).
- Luật trên màn (D-186, ghi căn cứ và "cần đối chiếu" như đặc tả): người tiếp thị, người livestream phải xác
  thực danh tính (Luật TMĐT 122/2025/QH15, NĐ 147/2024) qua một cổng kiểm (`gateIssues`); khấu trừ TNCN là
  dữ liệu thuế có ngày hiệu lực (TT 111/2013 Điều 25; NĐ 253/2026 cần đối chiếu), tính trên cả lệnh chi;
  tiền chỉ qua đối tác có giấy phép hoặc chuyển khoản tay rồi ghi (D-187); phân khúc, lịch sử mua, lượt bấm
  là dữ liệu cá nhân (Luật 91/2025) — SĐT, email, ngày sinh luôn che bớt trên màn; nhắc giỏ theo NĐ 91/2020;
  thẻ quà tặng tắt (NĐ 52/2024). Thưởng điểm khi đánh giá không phụ thuộc số sao (`ui-phase3-api.md`).
- Thao tác về tiền hay không đảo được qua hộp xác nhận nêu hệ quả (`MoneyConfirm` hay `ConfirmButton`): huỷ
  đơn bán quá trên kênh, ghi sổ bảng kê, chi lại, đánh dấu đã chi tay, điều chỉnh điểm, ngắt kết nối, gỡ bán,
  đóng quy tắc, bắt đầu / kết thúc phiên, tắt link, chấm dứt người tiếp thị. Thao tác đảo được có Hoàn tác:
  khoá / mở tài khoản người mua, gỡ chặn COD, tạm dừng / chạy lại tài khoản kênh, mở lại người tiếp thị.
  Khoá kết nối của kênh nhập ở ô mật khẩu, không điền lại khi báo lỗi, không lưu trong kho mẫu.
- Khối hiển thị dùng chung của ba màn ở `components/growth/blocks.tsx` (số liệu, dòng tiền, cặp nhãn – giá
  trị, dòng thời gian, dòng chi tiết); chữ dưới `customers.*`, `channels.*`, `affiliate.*`; `Namespace` của
  `lib/commerce-action.ts` thêm ba tên. Ngày hiệu lực (ngày, không phải giờ) hiện bằng `formatDay`.

Lý do: chủ dự án muốn dựng đủ ba màn theo bản thiết kế trong lúc team API làm bước 47–49 (W-006); ba phân hệ
phải kể cùng một câu chuyện với Đơn hàng, Tồn kho, Khuyến mại đã dựng.

Đã cân nhắc: thêm đơn kênh viết tay có số mới — sẽ đổi dãy sinh số và số đếm 412 / 37; đơn kênh dùng giá
website — lệch với giá kênh trên màn Liên kết; tạo hồ sơ cho người mua qua kênh — trái đặc tả 48 (SĐT bị che);
làm lại danh sách giỏ bỏ dở ở màn Khách hàng — đã có ở Đơn hàng, chỉ giữ quy tắc nhắc (của `customers`).

## W-020 · Tổng quan và màn "Việc và hoạt động"; sổ nguồn việc mô phỏng bước 51 của core — 2026-11-15 — agent quyết

Quyết định:

- **Sổ nguồn việc ở `src/work/`**, theo đúng hình dạng của đặc tả bước 51 của core (`WorkSource`,
  `WorkItem` kèm `key` / `reason` của P10, `SummaryMetric`, `SetupStep`) để khi core có
  `GET /api/v1/kernel/work`, `/work/counts`, `/summary`, `/setup`, `GET /api/v1/audit/activity` thì chỉ
  thay phần đọc:
  - `types.ts` (kiểu), `registry.ts` (hàm thuần: lọc theo permission / module / dữ liệu mẫu, hạn thời
    gian mỗi nguồn 2 giây, nguồn lỗi hay chậm thì bỏ và ghi `incomplete` — giao diện báo "một nguồn
    không trả lời" thay vì hỏng cả hộp; sắp theo mức gấp rồi hạn; nhóm Quá hạn / Hôm nay / Sắp tới theo
    giờ Việt Nam; gắn trạng thái hoãn / giao; số đếm theo màn);
  - `sources.ts` (16 nguồn). Đọc **API thật**: bình luận chờ duyệt (`comments`), bài nộp form mới
    (`forms`), bài chờ duyệt (`content`, lọc `review_requested_at` trên một trang bản nháp vì core chưa có
    tham số). Đọc **dữ liệu mẫu** của phân hệ: đơn chờ nhận (không gồm đơn của người bán trên sàn), đổi trả
    quá hạn trả lời, tồn dưới mức tối thiểu, website chưa thông báo / đăng ký Bộ Công Thương (chặn bán),
    KYC chờ, sự cố chưa báo cơ quan (hạn 72 giờ), hoá đơn bị trả lỗi, sai lệch đối soát, kỳ cần khoá, COD
    lệch, tranh chấp chờ sàn phân xử, lệnh agent chờ duyệt (lọc theo permission của từng lệnh), thuế suất
    sắp hết hiệu lực. Việc tính từ dữ liệu: xử lý xong ở màn gốc thì việc tự biến mất, không có "đánh dấu
    xong";
  - `metrics.ts` (6 số: doanh thu hôm nay, đơn chờ xử lý, sắp hết hàng — mẫu; bài chờ duyệt, bình luận
    chờ duyệt, bài nộp chưa xử lý — thật), `setup.ts` (8 bước theo mô hình, bước pháp lý chặn bán đánh
    dấu; bước không áp dụng cho khách thì bỏ), `activity.ts` (câu hoạt động từ nhật ký audit thật),
    `revenue.ts`, `format.ts`, `server.ts` (đọc một lần mỗi request bằng `cache` của React).
  - Ba lần đọc core của nguồn thật dùng chung cho hộp việc, số đếm menu và ô số liệu.
  - Hạn gợi ý cho việc không có hạn trong dữ liệu (đơn chờ nhận 24 giờ theo `acceptance_hours` dự kiến,
    bình luận 1 ngày, bài nộp và bài chờ duyệt 2 ngày) nằm ở `sources.ts`; core sẽ để mỗi module tự khai.
- **Số đếm trên menu**: `NavPage.counter` (chỉ thêm; `"work"` hay danh sách id nguồn), như
  `NavItem.counter` của bước 51. Khung (`AdminShell`, chỉ không gian của khách) tính số qua
  `shellCounts`; menu con hiện số cạnh tên màn, thanh bên và bảng "Phân hệ" hiện chấm cạnh phân hệ có việc
  (chấm chỉ để nhìn, `aria-hidden`: tên phân hệ không đổi). Cách lọc menu không đổi. Lỗi khi đếm không
  bao giờ làm hỏng khung. Khung không chờ số: máy chủ gửi một promise, số hiện sau qua `use` trong
  `Suspense`; số giữ 10 giây trong bộ nhớ theo người xem (như cache số đếm của core, D-190), vì khung
  dựng lại ở mọi trang và mọi lần prefetch. Hộp việc và Tổng quan luôn đọc mới.
- **Dựng sẵn kho dữ liệu mẫu lúc khởi động** (`src/instrumentation.ts` → `src/sample/warm.ts`, chỉ khi
  bật dữ liệu mẫu): số đếm làm mọi trang đọc dữ liệu mẫu của nhiều phân hệ; không dựng sẵn thì trang đầu
  sau khi khởi động dựng hết các kho và chậm hẳn (e2e của màn Menu hỏng vì token hết hạn giữa chừng). Lỗi
  lúc dựng sẵn bị bỏ qua: kho tự dựng ở lần đọc đầu như trước.
- **Màn "Việc và hoạt động"** `/work`, nhóm `home` sau "Bảng điều khiển", mở được cho mọi người đã đăng
  nhập (mỗi người thấy việc theo permission của mình). Tab là đường dẫn con: Việc cần làm (`/work`, chip
  trạng thái `?state=` và phân hệ `?area=`), Hoạt động (`/work/activity`, đọc thật `GET /api/v1/audit`, cần
  `audit.read`), và ba tab chỉ có khi bật dữ liệu mẫu: Đã ghim (`pins`), Xem trước thao tác (`dry-run`),
  Tuỳ chọn thông báo (`notifications`).
- Trên mỗi việc: nút xử lý (link tới màn gốc, đã lọc sẵn), **Hoãn** (1 giờ, 3 giờ, 9:00 sáng mai, 9:00 thứ
  Hai tới — giờ Việt Nam; tối đa 30 ngày) và **Giao** (chỉ liệt kê người dùng của core có permission của
  nguồn theo role của họ; không đọc được danh sách người dùng thì chỉ giao cho mình). Cả hai có Hoàn tác,
  giữ trong `src/sample/work.ts` (bảng `kernel_work_states` của P10, của riêng từng người), "vì sao bạn
  thấy" nêu permission và nút. Ghim (chưa có trong lộ trình của core) và tuỳ chọn thông báo (bước 37 / 52)
  cũng ở đó.
- **Xem trước thao tác hàng loạt** (`src/sample/bulk.ts`, bước 51 P8): chạy thử là GET trên địa chỉ, không
  ghi gì; chạy thật hỏi lại, nêu hệ quả, gửi `expected_count` — số khớp đổi thì 409
  `kernel.bulk_count_changed`. Thao tác mẫu đổi nhóm thuế của sản phẩm trong một danh mục, đổi thật dữ liệu
  của `sample/catalog.ts`.
- **Tổng quan** `/`: lời chào theo giờ Việt Nam, số liệu (mỗi ô ghi nguồn: "API thật · module …" hay nhãn
  dữ liệu mẫu), hộp việc rút gọn (8 việc gấp nhất chưa hoãn, "Xem tất cả"), các bước thiết lập, doanh thu
  hôm nay theo nút (tiền thu thành công từ 0:00 giờ Việt Nam; hôm nay chưa thu thì hiện ngày gần nhất có thu
  và ghi rõ ngày đó), hoạt động gần đây và lối vào các phân hệ (nay gồm cả màn dữ liệu mẫu khi bật).
- Chỉ thêm vào component chung: `Dialog` / `FormDialog` nhận `ariaLabel` (nút "Hoãn", "Giao" lặp trên
  nhiều dòng có tên đầy đủ); ô `check` của `FormDialog` / `InlineForm` nhận `defaultChecked`.

Lý do: chủ dự án giao dựng màn theo bản thiết kế `Main` và `Work` và đặc tả bước 51; mô phỏng đúng kiểu
của core để thay bằng API dễ, và để số đếm menu, hộp việc, ô số liệu cùng một nguồn.

Đã cân nhắc: một bảng việc riêng trong dữ liệu mẫu — sai thiết kế của core (việc tính từ dữ liệu, tự biến
mất); đếm trên menu bằng một lời gọi riêng mỗi màn — nhiều lời gọi, số menu và hộp việc lệch nhau; lấy
hoạt động gần đây từ dữ liệu mẫu — core đã có nhật ký audit thật, không thay API có sẵn bằng mẫu (W-006).

## W-021 · SDK theo core v0.14.0; alt ảnh theo ngôn ngữ và mức rủi ro của permission đọc từ core; dữ liệu mẫu khớp nhau giữa các màn — 2026-11-15 — agent quyết

Quyết định:

- **SDK ghim theo bản phát hành của core, v0.14.0** (`CORE_VERSION` trong `packages/sdk/scripts/generate.mjs`;
  README ghi "v0.14.0 trở lên"). Endpoint đã có ở nhánh `main` của core nhưng chưa phát hành (passkey của người
  khác cho quản trị viên, xuất bài nộp form, báo "không phải tôi" khi đổi email) chờ bản phát hành kế tiếp rồi
  mới nối: SDK chỉ theo tag, không theo một commit chưa phát hành.
- **Alt theo ngôn ngữ ở Thư viện media đọc và ghi ở core**: ngôn ngữ đầu (mặc định của nội dung) là `alt` của
  tệp (`PATCH`); ngôn ngữ khác là `alts[ngôn ngữ]`, ghi bằng `PUT /media/{id}/alts/{locale}`, ô trống thì `DELETE`
  (người đọc ngôn ngữ đó lại thấy `alt`). Ghi lần lượt, mỗi lần dùng `ETag` lần trước trả về. Ngôn ngữ máy chủ không
  mở thì hiện lỗi `media.unsupported_locale` của core. Bộ chọn ảnh của trình soạn bài điền sẵn alt đúng ngôn ngữ
  của bài. Chỉ cờ "ảnh trang trí" còn là dữ liệu mẫu (core chưa có).
- **Nhãn mức rủi ro cạnh permission** ở bộ chọn của role và API key: `risk` lấy từ sổ module
  (`GET /kernel/modules`, cần `kernel.modules.read`) vì `GET /auth/permissions` chưa trả trường này; chỉ nêu
  `destructive`, `sensitive_data`, `money`. Không đọc được sổ module thì bộ chọn vẫn chạy, không có nhãn.
- **Dữ liệu mẫu khớp nhau giữa các màn**, có test giữ:
  - mọi đơn của màn Sàn có ở màn Đơn hàng (kênh sàn, cùng người bán, cùng món và tiền hàng); hai mã trùng đơn web
    được dời (0386→0384, 0408→0404);
  - bộ sinh đơn vẫn rút đủ số ngẫu nhiên cho mã nay viết tay (`REPLACED_FILLERS`), nên đơn sinh khác không đổi;
  - thuế của đơn trong sổ cái tính theo từng dòng như màn Đơn hàng; cửa hàng của đơn khớp nhau;
  - xuất bán, nhận trả, serial của Tồn kho trỏ tới đơn có đúng món;
  - hoá đơn cùng tổng tiền, thuế, người mua với đơn; hoá đơn thay mặt người bán chỉ cho đơn sàn của người đó.

Lý do: core đã có API thì không giữ dữ liệu mẫu cho phần đó (W-006). Dữ liệu mẫu lệch nhau giữa các màn (mở đơn
từ màn Sàn ra một đơn web khác, hoá đơn khác tiền với đơn) làm người thử tưởng giao diện sai.

Đã cân nhắc: ghim SDK theo `main` của core — có thêm endpoint nhưng hợp đồng chưa chốt, đổi lại thì giao diện hỏng
theo; gọi thêm `GET /kernel/modules` ở mọi màn có permission — chỉ ba màn chọn permission cần mức rủi ro; sinh lại
toàn bộ đơn mẫu theo số ngẫu nhiên riêng cho từng mã — đổi hết số liệu mà các màn và test đang dùng.

## W-022 · Màn Menu gọi module `menus` thật của core v0.14.0; chỉ sổ đối tượng thương mại còn là dữ liệu mẫu — 2026-11-15 — agent quyết

Quyết định:

- **Màn Menu (`/content/menus`) gọi API thật** của module `menus` (D-238 của core): danh sách
  (`GET /api/v1/menus`, đọc hết theo `cursor`), đọc kèm `ETag`, tạo (`POST`, 201), lưu cả cây (`PUT`,
  `If-Match` bắt buộc), xoá, và menu công khai (`GET /api/v1/menus/public/{key}?locale`, gọi như khách).
  Sổ điều hướng: màn theo module `menus` và `menus.read`, không còn `sample`. Thay phần "menu dựng bằng
  dữ liệu mẫu" của W-010.
- Bản nháp của trình sửa (`src/lib/menu-tree.ts`) theo đúng hình dạng `SiteMenuItemInput`: `ref` /
  `feature` là `{ kind, id }`, `badge` là `{ text, tone, from, until }` (thời điểm RFC 3339), bộ
  biểu tượng 27 tên và kiểu nổi bật `accent | brand | sale | muted` của core; bỏ các trường đoán trước
  (`ref_kind`, `badge_text`, `version`, `website`, người sửa). Đổi qua lại và gửi lên ở `src/lib/menus.ts`
  (hàm thuần, có test): `auto_children_limit` chỉ gửi khi bật, trường trống không gửi. Kiểm trước khi
  gửi đúng như `items.rs` của core (đường dẫn như `is_link`, nhận cả `http://`).
- **Lỗi 422 của core** (`errors[]` theo vị trí `items[0].children[1].ref.id`) được đưa về đúng mục
  bằng cây vừa gửi; câu đầu là `detail` của core (đã dịch), từng dòng có mã; ba mã của `menus`
  (`ref_unknown_kind`, `ref_not_found`, `children_unsupported`) và `too_deep` có câu riêng, còn lại hiện
  `detail` của core. 412 → "người khác vừa lưu", bản nháp còn nguyên, nút tải bản mới. Bỏ nút "Thử:
  người khác vừa lưu" (412 nay là của core thật; e2e dùng `POST /__menus/bump` của core giả).
- Core cấp **id mới cho mọi mục sau mỗi lần lưu**, nên trình sửa giữ mục đang chọn và bảng xổ đang mở
  theo vị trí, không theo id (trình sửa vẫn không dựng lại khi `router.refresh()`).
- Ngày của nhãn nổi bật nhập theo giờ Việt Nam: "hiện từ" là 0:00 của ngày đó, "hiện tới (hết ngày)"
  gửi 0:00 ngày hôm sau (core ẩn từ `until`). Không sửa ô ngày thì gửi lại đúng giá trị đã đọc.
- **Đích của mục**: hai loại core đã có ghi ở `CORE_REF_KINDS` (`content.entry`, `content.term` có cây;
  core chưa có API liệt kê loại); bài, trang, danh mục, thẻ đọc THẬT qua API của `content` (200 bài mới
  sửa nhất, 200 danh mục / thẻ; bài công khai khi `status = published`), có ô tìm trong danh sách đã đọc.
  Loại thương mại (danh mục sản phẩm 41, khuyến mại 43, gian hàng 46, cửa hàng 34) và đối tượng của chúng
  là **dữ liệu mẫu** (`src/sample/menus.ts`, nhãn `SampleBadge`, chữ "Mẫu" trên mục): chọn được để thấy
  trình sửa theo thiết kế, nhưng lưu thì core trả `menus.ref_unknown_kind` và giao diện hiện đúng lỗi đó.
- Xem trước mặt tiền có hai nguồn: "Bản nháp" (dựng từ bản chưa lưu theo luật của menu công khai: bỏ
  đối tượng không công khai kèm mục con, bỏ nhóm rỗng, nhãn ngoài hạn ẩn) và "Đang hiện trên website"
  (câu trả lời thật của menu công khai). Chung một cách vẽ (`PreviewItem`).
- **Menu cũ của `content`**: core đã gửi `Deprecation`, `Sunset`, `Link` trên `/content/menus…`; ngày
  ngừng hiện từ header `Sunset` thật. Lệnh nhập chỉ có ở máy chủ (`autoxide task
  menus.import_content_menus`), chưa có API: màn hiện xem trước tính từ menu cũ thật và danh sách menu
  thật (chưa có cùng khoá và ngôn ngữ thì tạo, có rồi thì giữ) kèm câu lệnh; không có nút chạy, không giả
  lưu được. Bỏ khối nhập dữ liệu mẫu của W-010.
- Thêm 13 biểu tượng nét vào `Icon` cho bộ biểu tượng của core (`bag`, `bolt`, `calendar`, `category`,
  `chat`, `fire`, `heart`, `help`, `percent`, `phone`, `shop`, `star`, `truck`); `news`, `map_pin`,
  `sparkles` vẽ bằng `posts`, `pin`, `spark` có sẵn.
- Core giả có `e2e/mock-menus.ts` (đúng hình dạng `openapi.json`, kiểm và mã lỗi như core, 201 +
  `Location`, `ETag` / `If-Match` / 412 / 428, menu công khai không cần đăng nhập) và module `menus` trong
  sổ module.

Lý do: core v0.14.0 đã có module `menus`; W-006 không cho thay API có sẵn bằng dữ liệu mẫu. Phần core còn
thiếu (sổ đối tượng, API nhập menu cũ) giữ mẫu hoặc chỉ xem trước, nói rõ trên màn.

Đã cân nhắc: chạy nhập menu cũ từ giao diện bằng `POST /api/v1/menus` cho từng menu — chép logic của lệnh
trên máy chủ vào giao diện, và `POST` kiểm đích còn lệnh nhập thì không; giữ kho mẫu cho phần nhập — tạo
menu giả lẫn với menu thật; liệt kê loại thương mại chỉ khi core có — mất phần thiết kế cần thử.

## W-023 · Trợ giúp trong giao diện: nút "?", hộp ⓘ, thẻ giới thiệu, cờ theo người dùng của core — 2026-11-15 — agent quyết

Bối cảnh: thiết kế mục 6 của core (`docs/research/ui-design.md`, "Trợ giúp trong giao diện") có ba mẫu
cho trang quản trị: bảng Trợ giúp theo trang mở từ nút "?", nút ⓘ (toggletip) cạnh tiêu đề mục, thẻ giới
thiệu tính năng mới tắt được. Core v0.14.0 đã có cờ giao diện theo người dùng (D-207:
`GET/PUT/DELETE /api/v1/me/flags`).

Quyết định:

- **Cờ ở core, không ở trình duyệt.** Gợi ý đã tắt: `hint.<id>` = `dismissed`; "Có gì mới" đã xem:
  `whatsnew.seen` = phiên bản mới nhất đã xem. `src/help/server.ts` đọc mọi cờ một lần mỗi request
  (`cache` của React); khung và trang dùng chung. Khung **không chờ** lời gọi cờ: nút "?" nhận một
  promise (như số đếm của W-020) và đọc nó trong effect, không qua `Suspense` — đổi từ phần chờ sang
  phần thật sẽ dựng lại nút và bảng, đóng bảng người dùng vừa mở khi máy chậm (e2e đã bắt được). Chưa
  biết cờ thì chưa có chấm và mở bảng không ghi gì. Trang Đơn hàng thì chờ cờ (`cache`, cùng lần gọi với
  khung) để thẻ giới thiệu không hiện rồi biến mất. Đọc lỗi gì cũng trả `null` và mọi gợi ý vẫn hiện (fail open): cờ chỉ để bớt làm phiền, không
  được làm hỏng trang. Ghi qua Server Action `src/help/actions.ts` (SDK tự gắn `Idempotency-Key`; PUT
  ghi đè nên gọi lại an toàn); trình duyệt chỉ gửi id gợi ý nằm trong danh sách `HINTS`, key và giá trị
  do máy chủ dựng. Giao diện ẩn ngay (lạc quan); ghi không được thì lần tải sau gợi ý hiện lại.
- **Nút "?" ở đầu mọi trang của khung** (cả ba không gian), phím `?` mở ở mọi màn (trừ khi đang gõ
  chữ). Bảng là popover HTML: bên phải trên máy tính, tấm trượt từ đáy trên điện thoại. Nội dung theo
  đường dẫn (`src/help/pages.ts`): Tổng quan `/`, Đơn hàng `/sales/orders`, Nội dung `/content`, Tổ chức
  `/org` (gồm `/org/access`), Tuân thủ `/compliance`, Nền tảng `/platform`, Nhà phát triển
  `/settings/developers`, API key `/settings/api-keys`; màn khác chỉ có tìm, phím tắt và "Có gì mới".
  - Core chưa có API bài hướng dẫn: bài là tiêu đề và một câu tóm tắt ở `messages/` (`help.pages`). Bài
    có màn liên quan thì là liên kết tới màn đó; không có thì chỉ là chữ — không có liên kết giả. Ô tìm
    lọc mọi bài của mọi trang (không cần dấu).
  - Màn kỹ thuật (Nền tảng, Nhà phát triển, API key) có lối tải `openapi.json` qua route sẵn có
    `/settings/developers/openapi.json`.
  - **Không có "Hỏi trợ lý AI" và "Liên hệ hỗ trợ"**: giao diện chưa có lối vào trợ lý, cũng chưa có
    luồng liên hệ; thêm khi có, không dựng nút không làm gì.
  - **"Có gì mới"** là danh sách tĩnh `src/help/whats-new.ts` (core chưa có nguồn tin cập nhật), phiên bản
    là ngày phát hành thêm `.n`, so theo từng phần số. Nút "?" có chấm khi còn tin mới hơn
    `whatsnew.seen`; mở bảng thì ghi cờ, chấm mất ngay, nhãn "Mới" còn trên tin trong lúc đang đọc.
- **Nút ⓘ** (`InfoTip`, `TipHeading` ở `src/components/help/info-tip.tsx`): bấm hay chạm mới mở, popover
  `auto`, đặt cạnh nút bằng CSS anchor positioning (trình duyệt chưa hỗ trợ thì hộp ở đáy màn hình);
  trên điện thoại là tấm trượt từ đáy có nút "Đã hiểu". "Tìm hiểu thêm" đóng hộp và mở bảng Trợ giúp
  của trang. Nút nằm **cạnh** thẻ tiêu đề, không nằm trong, để tên của tiêu đề (mà `aria-labelledby`
  của mục và test dùng) giữ nguyên. 14 hộp trên các màn trên; chữ theo luật viết của thiết kế: tối đa ba
  câu và một ví dụ, nêu căn cứ pháp luật kèm "cần đối chiếu văn bản gốc", không chứa thông tin bắt
  buộc hay cảnh báo (những thứ đó vẫn hiện thẳng trên trang). Chữ trong hộp bổ sung cho dòng giải thích
  đã có trên trang, không lặp lại; riêng "View đã lưu" của Đơn hàng thì dòng giải thích cũ chuyển vào
  hộp (thẻ giới thiệu đã nói tính năng ngay trên đó).
  - **Không có hộp định nghĩa số liệu** (thiết kế có "Doanh thu hôm nay tính thế nào?"): luật của thiết
    kế là định nghĩa số liệu lấy từ máy chủ, mà `definition` của `GET /api/v1/kernel/summary` mới ở đặc
    tả bước 51 P4 (D-207 mục 2). Cách tính doanh thu vẫn ghi ngay dưới khối như trước.
- **Chú thích khi rê chuột** (`data-tip`, chỉ máy có chuột, sau 0,4 giây) chỉ cho nút chỉ có biểu
  tượng: nút "?". Đầu trang thật chưa có nút sáng / tối hay thông báo như bản thiết kế.
- **Thẻ giới thiệu** (`IntroCard`): Đơn hàng, "Lưu view cho bộ lọc hay dùng"; trang chỉ dựng thẻ khi cờ
  `hint.saved_views` chưa có, nên đã tắt thì không hiện lại ở mọi thiết bị của tài khoản.
- Core giả có `/api/v1/me/flags` (`e2e/mock-flags.ts`, theo tài khoản, trong bộ nhớ, đúng hình dạng
  `openapi.json`, kiểm key / giá trị, 409 `kernel.flag_limit_reached`).

Lý do: trợ giúp đúng lúc cạnh tính năng hiệu quả hơn hướng dẫn dạo đầu (thiết kế mục 6); lưu ở core vì
lưu ở trình duyệt thì đổi máy là hiện lại.

Đã cân nhắc: lưu cờ ở `localStorage` — đổi máy hiện lại, sai yêu cầu "lưu theo người dùng"; hộp mở khi
rê chuột — không dùng được trên điện thoại, không chứa được nút; đặt bảng Trợ giúp vào từng trang —
mỗi trang phải tự thêm, dễ sót, trong khi khung đã có ở mọi trang; bịa bài hướng dẫn có trang riêng hay
nút trợ lý AI — liên kết giả.

Thiếu ở core (ghi lại để thêm sau): API bài hướng dẫn theo trang, nguồn tin "Có gì mới", `definition`
của số liệu (bước 51 P4).

## W-024 · Giao diện sáng / tối nhớ theo tài khoản bằng cờ `ui.theme`; sửa ba lỗi làm bài thử chập chờn — 2026-11-15 — agent quyết

Quyết định:

- **Sáng / tối theo tài khoản**: cookie `ax_theme` vẫn quyết định lúc vẽ trang (trang đăng nhập và mọi trang
  không phải gọi thêm core). Đổi lựa chọn thì ghi thêm cờ `ui.theme` (`/me/flags` của core v0.14.0); đăng nhập
  (mật khẩu hay mã xác thực hai bước) thì đọc cờ đó bằng access token mới và đặt lại cookie. Lỗi khi đọc hay ghi
  cờ không chặn việc đổi giao diện hay đăng nhập. Mã ở `src/lib/theme-sync.ts`.
- **`useSubmit` giữ cập nhật sau `await` trong transition**: React 19 không tự giữ transition qua `await`, nên
  thông báo lỗi hiện ở một lần vẽ còn việc React đặt lại form sau lần gửi đến ở lần vẽ sau; chữ người dùng gõ sửa
  trong khoảng giữa bị đè về giá trị cũ. Báo thành công (`onDone`) vẫn chạy ngay, không chờ trang làm mới.
- **Trình sửa Menu không bao giờ ghi đè bản nháp đang sửa** bằng bản của người khác khi trang làm mới: giữ bản
  nháp, báo xung đột (`conflictRemote`), người dùng tự bấm "Tải bản mới". Tự nhận bản mới chỉ khi đó là lần lưu
  của chính mình hoặc bản nháp chưa sửa gì.
- **Dữ liệu mẫu có giờ trong ngày** đặt tương đối với lúc mở màn (flash sale cuối tuần: tối mai), không đặt giờ
  cố định của hôm nay.

Lý do: ba lỗi trên làm e2e hỏng ngẫu nhiên khoảng một bài mỗi lượt; cả ba đều là lỗi người dùng gặp được (mất
chữ vừa sửa, mất bản nháp, chương trình mẫu không bật được sau 22:00). Lựa chọn giao diện là dữ liệu nhỏ của
người dùng mà core đã có chỗ giữ (D-207 của core), không cần API mới.

Đã cân nhắc: đọc cờ giao diện ở mọi trang thay cho cookie — thêm một lời gọi core cho mỗi trang, và trang đăng
nhập chưa có token; sửa bài thử cho chờ lâu hơn — che lỗi thật thay vì sửa.

## W-025 · SDK ghim theo một commit trên `main` của core khi bản phát hành đến chậm; nối các tính năng bước 31–32 — 2026-11-15 — agent quyết

Thay một phần W-021 ("SDK chỉ theo tag").

Quyết định:

- **`CORE_VERSION` của SDK có thể là SHA của một commit trên `main` của core**, không chỉ tag. Luôn ghim **một
  commit cụ thể** (lặp lại được, core đổi gì sau đó không làm hỏng giao diện), không bao giờ ghim "main mới
  nhất". Hiện ghim `e2c3596` (sau bước 32). Core phát hành bản có commit đó (v0.15.0) thì chuyển về tag. README
  ghi rõ commit tối thiểu.
- Nối các tính năng của bước 31–32:
  - **Passkey của người khác** ở trang người dùng (`auth.passkeys.manage`): danh sách, gỡ một, gỡ hết, mỗi thao
    tác hỏi lại và nêu hệ quả. Core từ chối (403) khi người đó có permission mà người xem không có: trang hiện
    câu giải thích, không hỏng.
  - **Xuất bài nộp chạy nền** (`forms.export`): nút "Xuất nền" cạnh "Xuất CSV"; hỏi lại trạng thái hai giây một
    lần; tải tệp qua route của máy chủ giao diện (`/marketing/forms/exports/{id}/file`) — máy chủ xin link có chữ
    ký mới rồi tự tải, ghép đường dẫn của link vào địa chỉ core mà giao diện dùng.
  - **Trang công khai `/not-me?token=`** cho thư báo đổi email (`AUTOXIDE_AUTH_EMAIL_CHANGE_REPORT_URL` của
    core): mở trang không làm gì, bấm "Không phải tôi" mới khoá tài khoản (trình quét link của hộp thư không
    khoá nhầm).
  - **Bình luận viết bằng Markdown**: nhãn "Markdown" ở trang duyệt (người duyệt vẫn thấy nguyên văn), tab Cài
    đặt hiện `markdown` và `verified_only_types`.

Lý do: core chỉ phát hành khi xong một giai đoạn (D-248 của core), nên tính năng đã xong trên `main` có thể chờ
lâu; chủ dự án muốn làm tiếp không chờ. Ghim theo commit giữ được điều W-021 cần (hợp đồng cố định, lặp lại được).

Đã cân nhắc: ghim theo "main mới nhất" — mỗi lần sinh lại SDK có thể ra hợp đồng khác, giao diện hỏng mà không
biết vì sao; chờ bản phát hành — không biết bao giờ.

## W-026 · Website bán hàng `apps/storefront`: nền chung, trang dùng API thật, trang chủ; dữ liệu mẫu kín đáo — 2026-11-15 — agent quyết

Theo D-097 (một stack Next.js cho trang quản trị và website, cùng repo) và D-200 (website là mặt tiền
bán hàng của một khách; blog là một mục) của core, thiết kế ở `docs/research/ui-design.md` mục 3, 7, 8
của core và các bảng trang "v2" của bản thiết kế mặt tiền.

Quyết định:

- **App mới `apps/storefront`** (`@autoxide/storefront`), cùng phiên bản thư viện với `apps/admin`
  (Next.js 16, React 19, next-intl 4, Vitest, Playwright), `output: "standalone"`,
  `scripts/start-standalone.mjs`, Biome của gốc. Không thêm thư viện nào.
- **Không Tailwind**: CSS của bản thiết kế (`shop-r38.css`) chép gần nguyên văn thành
  `src/styles/shop.css` (lớp `.pcard`, `.pgrid`, `.g2/.g3/.g4/.g6`, `.filters`, `.buybar`, `.co-nav`,
  `.segtabs`… để trang thương mại dùng lại), `!important` của bản gốc bỏ đi; màu ở `tokens.css`; lớp
  của website thay cho `style="…"` của bản thiết kế ở `site.css`. Thứ tự nạp: tokens → site → shop
  (luật theo khổ màn của bản thiết kế ghi đè lớp của website như bản gốc ghi đè style). Trang đặt hàng
  khép kín bằng `<main class="enclosed">`.
- **Sáng / tối**: `data-theme` trên `<html>` từ cookie `ax_theme` (như trang quản trị), không có thì
  theo máy; nút đổi ngay không tải lại. **Bốn kiểu giao diện** của các bảng `Main`, `StyleMarket`,
  `StyleMinimal`, `StyleLuxe`: `AUTOXIDE_STOREFRONT_THEME` (`default`, `market`, `minimal`, `luxe`) →
  `data-variant`, chỉ đổi biến (màu, phông tiêu đề, bo góc nút). Tạm là biến môi trường; khi core có cấu
  hình giao diện của khách (hồ sơ công khai, bước 34) thì đọc từ đó. Không tải phông từ máy chủ ngoài
  (không gửi IP người đọc cho bên thứ ba): Be Vietnam Pro / Inter khi máy có, không thì phông hệ thống.
- **Ngôn ngữ trên địa chỉ** (SEO): next-intl `localePrefix: "as-needed"`, tiếng Việt mặc định ở `/`,
  tiếng Anh ở `/en`; không đoán theo trình duyệt hay cookie (một địa chỉ một ngôn ngữ). Ngôn ngữ đọc
  bằng `next/root-params` (`requestLocale` đã deprecated); Server Action và route handler truyền ngôn
  ngữ rõ ràng. `hreflang`, `canonical`, Open Graph qua `pageMetadata()` (`src/lib/seo.ts`) cho mọi trang.
- **Gọi core**: chỉ endpoint công khai, từ máy chủ Next.js, không token (`src/lib/core.ts`:
  `loadPublic` — 404 thành `null`; `loadOptional` — mọi lỗi thành `null` cho khối phụ). Ảnh của core
  (`/api/v1/media/<id>/content?v=`) đi qua route cùng đường dẫn của website. Lệnh ghi công khai (bình
  luận, bản tin, token chống spam) chuyển tiếp `X-Forwarded-For`; token chống spam xin khi người đọc
  focus vào form (Server Action), không để trong HTML.
- **Trang dùng API thật**: menu `main` (thanh danh mục, bảng xổ bằng CSS từ 1024px, dải chip ở màn hẹp)
  và `footer`; `/blog` (12 bài một trang, con trỏ của core), `/blog/{category|tag}/<slug>`,
  `/blog/author/<slug>`; mọi địa chỉ khác qua `content/public/resolve` (bài, trang tĩnh, chuyển
  hướng; "đã gỡ" trả 404 vì trang App Router chưa trả được 410); bài viết theo bảng `Article` (khung
  1144px, mục lục, bản dịch, nhãn AI, bình luận của khách theo cài đặt công khai, `body_html` của core);
  `/search` (bài và trang của core + sản phẩm mẫu; core tắt tìm theo nghĩa cho khách — mặc định, 404
  `content.semantic_search_disabled` — thì tìm theo chữ trong bài bằng `posts?q=`); `/preview?token=`; trang mở từ thư:
  `/newsletter/confirm|preferences|unsubscribe`, `/comments/verify|unsubscribe` (chỉ chạy khi bấm nút);
  `sitemap.xml` (theo con trỏ tới hết, `hreflang`), `robots.txt`, RSS `/feed.xml`, `/en/feed.xml`.
- **Dữ liệu mẫu trên website** (W-006, cùng biến `AUTOXIDE_WEB_SAMPLE_DATA`): thư mục
  `src/sample/`, chép phần tối thiểu từ dữ liệu mẫu của trang quản trị (không import chéo app): 12 sản
  phẩm đang bán, SKU, giá bán lẻ quý 4, danh mục, tồn ở CN Quận 3 / Thủ Đức / Cầu Giấy, mã BEPMOC10, ba
  người bán. Trên website công khai không dùng nhãn lớn: dấu `SampleMark` nhỏ ("mẫu", `title` ghi
  endpoint và bước còn thiếu) và dải `SampleNotice` đầu trang. Tắt dữ liệu mẫu thì mọi khối thương mại,
  dải cam kết, chọn cửa hàng, giỏ, tài khoản ẩn; trang chủ chỉ còn lời mở đầu chung và bài viết. Menu:
  core trả 404 (khách chưa tạo menu) thì dùng menu mẫu khi bật dữ liệu mẫu — menu thật luôn thắng. Giỏ
  hàng mẫu và cửa hàng đã chọn ở cookie `sf_cart`, `sf_store` (Server Action ghi). Tên cửa hàng:
  `AUTOXIDE_STOREFRONT_NAME`, trống thì tên khách mẫu khi bật dữ liệu mẫu, không thì "Autoxide".
- **Test**: Vitest cho hàm thuần (tiền, thân bài, menu, SEO, RSS / sitemap, giỏ, catalog mẫu,
  messages hai ngôn ngữ, matcher của proxy) và `BodyView`; Playwright `apps/storefront/e2e/` chạy bản
  standalone với core giả của trang quản trị ở cổng riêng (core 4012, website 3200), phần công khai mới
  của core giả ở `apps/admin/e2e/mock-storefront.ts` (dữ liệu riêng, không đụng dữ liệu của test trang
  quản trị). Bài bố cục quét 360–1440px: không cuộn ngang, tiền không bẻ dòng, không thẻ lẻ. `gate.sh`
  chạy e2e của website sau trang quản trị. `Dockerfile` nhận `--build-arg APP=storefront`.

Cho hai agent làm tiếp các trang thương mại:

- **Trang mới** ở `src/app/[locale]/<đường dẫn>/page.tsx`, đường dẫn lấy từ `src/lib/routes.ts`
  (`/danh-muc/<slug>`, `/san-pham/<slug>`, `/gio-hang`, `/thanh-toan`, `/tai-khoan`,
  `/tra-cuu-don-hang`, `/khuyen-mai`, `/livestream`, `/nguoi-ban/<slug>`, `/ban-tren-cho`). Trang là
  Server Component, `<main id="main">`, `generateMetadata` dùng `pageMetadata()`; trang không vào chỉ mục
  (giỏ, đặt hàng, tài khoản) đặt `noindex`. Link nội bộ dùng `Link` của `@/i18n/navigation`. Trang đặt
  hàng: `<main className="enclosed …">` để đầu trang khép kín.
- **Dữ liệu mẫu** thêm vào `src/sample/<phân hệ>.ts`, mỗi hàm có comment "Thay bằng `<endpoint>`
  (bước N)", dữ liệu khớp trang quản trị (comment trỏ tới file nguồn); có sẵn `catalog.ts` (sản phẩm,
  danh mục, cửa hàng, tồn, mã giảm), `cart.ts` + `actions.ts` (giỏ trong cookie), `site.ts` (khách mẫu,
  người bán, món ăn), `view.ts` (`productCard()`), `server.ts` (`readCart`, `readStore`). Khối dùng mẫu
  luôn có `SampleMark` và chỉ hiện khi `sampleDataEnabled()`.
- **Component dùng chung** (`src/components/`): `ProductCard` (+ `ProductCardData`, độc lập với nguồn),
  `Price` (tiền, NBSP), `Rating`, `Badge`, `Breadcrumbs`, `SectionHeader`, `PostCard`, `PostList`,
  `AddToCart`, `MediaImage`, `BodyView`, `Icon` / `Art` (bộ biểu tượng của menu core và hình minh hoạ
  sản phẩm), `SampleMark`. Chữ chỉ qua `messages/{vi,en}.json` (thêm namespace theo trang).
- **CSS**: lớp của bản thiết kế có sẵn ở `shop.css`; lớp riêng của trang thêm vào `site.css` với tiền tố
  của trang, chỉ dùng biến của `tokens.css`; lưới có số thẻ cố định dùng `.g2/.g3/.g4/.g6`; số tiền luôn
  qua `Price` / `.price`. Thêm trang vào vòng lặp bố cục của `e2e/storefront.spec.ts`.

Chỗ core còn thiếu cho website (ghi thêm vào bảng chỗ thiếu API của core): hồ sơ công khai của khách
(tên, thông tin pháp lý, logo Bộ Công Thương, cấu hình giao diện — bước 34); danh sách danh mục / thẻ công
khai của `content` (chip chủ đề của `/blog` đang gom từ bài trên trang); nhúng bản ghi trong nội dung
(sản phẩm trong bài — bước 51); catalog, tồn, giá khi áp mã, cửa hàng, giỏ, đơn, người bán (bước 41–46);
bộ biểu tượng của menu chưa có biểu tượng ngành hàng (website dùng hình minh hoạ cho danh mục mẫu).

Lý do: chủ dự án giao dựng website theo bản thiết kế mặt tiền; nền chung (khung trang, dữ liệu mẫu,
component, test) làm trước để hai agent sau thêm trang mà không dựng lại. Ngôn ngữ trên địa chỉ và
render phía máy chủ là điều kiện của SEO (D-097).

Đã cân nhắc: Tailwind như trang quản trị — phải viết lại toàn bộ luật của bản thiết kế, khó đối chiếu với
bảng gốc; ngôn ngữ theo cookie như trang quản trị — máy tìm kiếm chỉ thấy một ngôn ngữ; chia component
sang một gói chung với trang quản trị — hai app khác hẳn về giao diện, chỉ chung vài hàm thuần (chép kèm
comment trỏ nguồn); nhãn "Dữ liệu mẫu · chờ API bước N" như trang quản trị — quá nổi trên trang bán hàng;
tải phông Google lúc build — build cần mạng, và website gửi IP người đọc cho bên thứ ba nếu tải lúc chạy.
