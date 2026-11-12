# Autoxide Web

Giao diện quản trị của [Autoxide](https://github.com/thuongtamduy/autoxide), lõi backend viết
bằng Rust. Giao diện chỉ gọi REST API công khai của core. Các trang của nó cần một tài khoản
core đã đăng nhập.

[English](README.md)

## Trạng thái

Màn hình đầu tiên: **module**. Màn hình liệt kê các module đã cài trên máy chủ core và những gì
mỗi module khai: permission, event, job, lịch chạy, tool MCP, endpoint deprecated và trạng thái
migration. Màn hình chỉ xem: module được biên dịch cùng core, nên cài hay gỡ một module nghĩa là
build lại core.

Chạy với core Autoxide **v0.5.0** trở lên.

## Cần có

- Node.js 22 trở lên và [pnpm](https://pnpm.io) 10 (`corepack enable` cài đúng phiên bản đã
  ghim).
- Một core Autoxide đang chạy (xem README của core), và một tài khoản có permission
  `kernel.modules.read`. Role `admin` có sẵn mọi permission:

  ```bash
  autoxide user create --email you@example.com --name You --admin --password-stdin
  ```

## Bắt đầu

```bash
pnpm install
cp apps/admin/.env.example apps/admin/.env.local   # sửa AUTOXIDE_API_URL nếu cần
pnpm --filter @autoxide/admin dev
```

Mở <http://localhost:3000> và đăng nhập bằng tài khoản core.

### Cấu hình

| Biến                          | Mặc định                   | Ý nghĩa                                                                                                    |
| ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AUTOXIDE_API_URL`            | `http://127.0.0.1:8080`    | Địa chỉ của core, không có `/api/v1`. Chỉ máy chủ của ứng dụng này gọi tới; trình duyệt không bao giờ gọi. |
| `AUTOXIDE_WEB_SECURE_COOKIES` | `true` khi chạy production | Chỉ gửi cookie phiên qua HTTPS. Chỉ tắt khi phục vụ qua HTTP thường.                                       |

### Chạy thật

Build rồi chạy máy chủ standalone:

```bash
pnpm build
PORT=3000 AUTOXIDE_API_URL=http://127.0.0.1:8080 pnpm --filter @autoxide/admin start
```

Hoặc bằng Docker:

```bash
docker build -t autoxide-web .
```

```bash
docker run -p 3000:3000 -e AUTOXIDE_API_URL=http://core:8080 autoxide-web
```

Hãy phục vụ ứng dụng qua HTTPS: khi chạy production, cookie phiên được đánh dấu `Secure`.

Nếu chạy nhiều bản ứng dụng sau load balancer, hãy bật sticky session. Mỗi refresh token chỉ
dùng được một lần, và các bản ứng dụng không chia sẻ lượt làm mới đang chạy.

## Cách hoạt động

- **Phiên đăng nhập.** Sau khi đăng nhập, access token và refresh token của core được giữ trong
  cookie `httpOnly`. Trình duyệt không bao giờ thấy chúng. Máy chủ của ứng dụng gắn access token
  vào mọi lời gọi core. Khi access token hết hạn, proxy (`src/proxy.ts`) đổi refresh token lấy
  cặp mới trước khi render trang.
- **Đăng nhập hai bước.** Tài khoản có ứng dụng xác thực sẽ có thêm bước nhập mã.
- **SDK.** `packages/sdk` chứa kiểu TypeScript sinh từ `openapi.json` của core và một client
  nhỏ. Nâng core: tăng `CORE_VERSION` trong `packages/sdk/scripts/generate.mjs` rồi chạy
  `pnpm sdk:generate`. Trình biên dịch sẽ chỉ ra mọi chỗ gọi không còn khớp.
  `AUTOXIDE_OPENAPI=/path/to/openapi.json pnpm sdk:generate` dùng một file có sẵn trên máy.
- **Ngôn ngữ.** Tiếng Anh và tiếng Việt. Ứng dụng gửi ngôn ngữ đã chọn cho core, nên thông báo
  lỗi của core trả về cùng ngôn ngữ.

## Phát triển

```bash
./gate.sh          # mọi lệnh dưới đây, theo thứ tự; phải xanh trước khi commit
pnpm lint          # Biome
pnpm typecheck
pnpm test          # Vitest
pnpm build
pnpm e2e           # Playwright, chạy với một core giả (apps/admin/e2e/mock-core.ts)
```

Test e2e cần Chromium: chạy `pnpm --filter @autoxide/admin exec playwright install chromium`,
hoặc đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ tới một bản có sẵn.

## Bố cục

| Đường dẫn           | Nội dung                                                 |
| ------------------- | -------------------------------------------------------- |
| `apps/admin`        | Ứng dụng quản trị (Next.js, App Router)                  |
| `packages/sdk`      | Client và kiểu dữ liệu sinh từ tài liệu OpenAPI của core |
| `docs/DECISIONS.md` | Nhật ký quyết định (tiếng Việt)                          |

## Giấy phép

Hai giấy phép như core: [MIT](LICENSE-MIT) hoặc [Apache-2.0](LICENSE-APACHE), tuỳ bạn chọn.
