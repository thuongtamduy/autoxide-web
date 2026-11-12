# CLAUDE.md

Luật cho AI agent làm việc trong repo này. `AGENTS.md` là liên kết tới file này. Chỉ giữ LUẬT
và CON TRỎ.

## Dự án

`autoxide-web`: giao diện cho core [Autoxide](https://github.com/thuongtamduy/autoxide). Stack
đã chốt ở D-097 của core; quyết định riêng của repo này ở [`docs/DECISIONS.md`](docs/DECISIONS.md).

- Chỉ dùng **REST API công khai** của core, qua `@autoxide/sdk`. Không đọc database của core,
  không gọi endpoint ngoài `openapi.json`.
- Core là nguồn sự thật: kiểm quyền, kiểm dữ liệu, thông báo lỗi đều do core làm. Giao diện chỉ
  hiện. Thiếu API thì thêm ở core (theo luật của core) trước, rồi sinh lại SDK.
- Repo công khai: viết mọi thứ với giả định người lạ sẽ đọc. Secret không bao giờ vào git.

## Luật cứng

- **Token không xuống trình duyệt.** Access token và refresh token chỉ nằm trong cookie
  `httpOnly`; chỉ code phía máy chủ (Server Component, Server Action, proxy) đọc chúng. File có
  `"use client"` không bao giờ import `@/lib/core` hay `@/lib/session` để lấy token.
- **Mỗi refresh token dùng một lần.** Làm mới token chỉ qua `refreshTokens` (`src/lib/refresh.ts`),
  hàm này gộp các request đồng thời.
- **Không đoán API thư viện.** Phiên bản ở đây mới hơn kiến thức có sẵn của model (Next.js 16:
  `middleware` đổi thành `proxy`; TypeScript 7; next-intl 4; msw 3). Đọc tài liệu đi kèm gói
  (`apps/admin/node_modules/next/dist/docs/`) hoặc file `.d.ts`; để `tsc` xác nhận.
- **Không sửa `packages/sdk/src/schema.d.ts` bằng tay.** Sinh lại bằng `pnpm sdk:generate`.
- **Hai ngôn ngữ.** Mọi chữ trên giao diện nằm ở `apps/admin/messages/{en,vi}.json`, hai file
  cùng key (test kiểm). Không viết câu cứng trong component.
- **Lỗi theo `code`.** Rẽ nhánh theo `code` của Problem; hiện `detail` của core (core đã dịch
  theo `Accept-Language`).

## Gate — định nghĩa "xong"

Một việc chỉ xong khi `./gate.sh` xanh: cài đúng lockfile, Biome, `tsc`, gitleaks, Vitest,
`next build`, Playwright e2e (core giả). Gate đỏ thì sửa code, không nới gate, không tắt lint,
không bỏ qua test.

- Code mới có test: hàm thuần và component có test Vitest; luồng người dùng có test Playwright
  trong `apps/admin/e2e/`. Core giả (`e2e/mock-core.ts`) phải trả đúng hình dạng của `openapi.json`.
- Trước khi báo xong một màn hình, chạy thử nó với core thật ít nhất một lần.

## Bố cục

| Thư mục        | Gói               | Vai                                           |
| -------------- | ----------------- | --------------------------------------------- |
| `apps/admin`   | `@autoxide/admin` | Trang quản trị (Next.js App Router)           |
| `packages/sdk` | `@autoxide/sdk`   | Client + kiểu sinh từ `openapi.json` của core |

Phiên bản thư viện ghim trong `pnpm-lock.yaml`. Thêm thư viện thì ghi lý do vào
`docs/DECISIONS.md`; vài chục dòng tự viết là đủ thì không thêm.

## Ngôn ngữ tài liệu

Giống core: README và hướng dẫn cho người ngoài viết tiếng Anh, kèm bản tiếng Việt song song
(`README.md` + `README.vi.md`, sửa cả hai trong cùng commit). File này, `docs/DECISIONS.md`,
comment trong code và báo cáo viết tiếng Việt; thuật ngữ kỹ thuật giữ nguyên tiếng Anh. Chữ
trên giao diện theo `messages/`.

## Agent tự quyết

Như core: tự quyết, chọn cách đơn giản nhất giải quyết trọn vấn đề; quyết định lâu dài ghi vào
`docs/DECISIONS.md` (chỉ thêm ở cuối). Dừng lại hỏi khi cần secret thật, tên miền, việc không
hoàn tác được ở bên ngoài (deploy, đẩy lên remote lần đầu), hoặc muốn đảo quyết định của chủ dự
án. Chủ dự án mới học lập trình: báo cáo bằng tiếng Việt, lời thường.
