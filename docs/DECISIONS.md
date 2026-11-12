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
