# Autoxide Web

Giao diện quản trị của [Autoxide](https://github.com/thuongtamduy/autoxide), lõi backend viết
bằng Rust. Giao diện chỉ gọi REST API công khai của core. Các trang của nó cần một tài khoản
core đã đăng nhập.

[English](README.md)

## Trạng thái

Trang quản trị theo bản thiết kế quản trị của Autoxide: thanh phân hệ (thanh đáy trên điện thoại),
menu các màn của từng phân hệ kèm số việc đang chờ cạnh mỗi màn, bảng lệnh (Ctrl K / ⌘K) và giao
diện sáng, tối hay theo hệ thống (nhớ theo tài khoản, nên đăng nhập ở máy khác cũng giữ lựa chọn). Một phân hệ chỉ hiện khi module của nó được cài trong core và role
của bạn có permission tương ứng.

Trợ giúp trong giao diện: nút **?** ở mọi trang (hoặc phím `?`) mở hướng dẫn của trang đó, phím tắt
và tin "Có gì mới"; biểu tượng ⓘ cạnh một mục giải thích mục đó ngay tại chỗ; một thẻ ngắn giới thiệu
tính năng mới cho tới khi bạn bấm "Đã hiểu". Thẻ đã tắt và tin đã xem được core nhớ theo tài khoản
(`/api/v1/me/flags`), nên đổi máy cũng không hiện lại.

**Các màn chạy trên API thật của core**

- **Tổng quan** và **Việc và hoạt động**: lời chào, số liệu, việc đang chờ bạn gom từ mọi phân hệ
  (hoãn hay giao cho người khác), các bước thiết lập và hoạt động gần đây từ nhật ký audit.
- **Nội dung**: bài viết và trang với trình soạn theo khối, duyệt và lên lịch, lịch sử phiên bản;
  trang, danh mục, thẻ, tác giả và chuyển hướng; **menu của website** (thanh danh mục, bảng xổ lớn,
  chân trang; mục trỏ tới bài, danh mục hay địa chỉ; xem trước mặt tiền); **thư viện media** (tải
  lên, thư mục, thẻ, alt theo từng ngôn ngữ kèm gợi ý của AI, thùng rác).
- **Tiếp thị**: biểu mẫu và bài nộp, danh sách, chiến dịch và người nhận bản tin, duyệt bình luận.
- **Tổ chức › Người dùng và role**: tài khoản, role với bộ chọn permission (permission rủi ro có
  nhãn), đăng xuất mọi nơi, tắt xác thực hai bước.
- **Cài đặt**: module, webhook, nhật ký audit, API key và AI agent (MCP), công cụ cho lập trình viên.
- **Tài khoản của tôi**: hồ sơ, email và mật khẩu, xác thực hai bước, passkey, thiết bị, dữ liệu của bạn.
- **Trang mở từ mail** (không cần đăng nhập): xác nhận email, quên và đặt lại mật khẩu.

**Các màn dùng dữ liệu mẫu** (có nhãn "Dữ liệu mẫu · chờ API bước N"), vì core dựng chúng ở các bước
sau: Bán hàng (đơn hàng, đổi trả, bán tại quầy, vận chuyển và COD, cửa hàng, kênh bán), Sản phẩm
(danh mục, giá, nhóm thuế, tồn kho), Tiếp thị (khuyến mại, tiếp thị liên kết), Khách hàng, Sàn và
Trung tâm người bán, Tài chính (sổ cái, hoá đơn điện tử, thuế), Cây tổ chức, Tuân thủ và Mặt điều
khiển nền tảng. Phần nào của màn thật mà core chưa có API cũng dùng dữ liệu mẫu theo cùng cách. Dữ
liệu mẫu chỉ hiện khi bật `AUTOXIDE_WEB_SAMPLE_DATA` (mặc định bật, trừ production); thay đổi ở đó nằm
trong bộ nhớ của ứng dụng và mất khi khởi động lại. Bản ghi mẫu khớp nhau giữa các màn (một đơn hàng,
vận đơn, bút toán và hoá đơn của nó là cùng một đơn).

Chạy với core Autoxide **v0.14.0** trở lên.

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

| Biến                          | Mặc định                    | Ý nghĩa                                                                                                    |
| ----------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AUTOXIDE_API_URL`            | `http://127.0.0.1:8080`     | Địa chỉ của core, không có `/api/v1`. Chỉ máy chủ của ứng dụng này gọi tới; trình duyệt không bao giờ gọi. |
| `AUTOXIDE_WEB_SECURE_COOKIES` | `true` khi chạy production  | Chỉ gửi cookie phiên qua HTTPS. Chỉ tắt khi phục vụ qua HTTP thường.                                       |
| `AUTOXIDE_WEB_SAMPLE_DATA`    | `false` khi chạy production | Hiện các màn và tab dùng dữ liệu mẫu trong lúc core chưa có API cho chúng.                                 |

### Link trong thư

Core gửi thư xác minh email và thư đặt lại mật khẩu. Đặt hai biến này **ở core** để link trong
thư mở ứng dụng này (thay địa chỉ bằng nơi ứng dụng chạy):

```bash
AUTOXIDE_AUTH_EMAIL_VERIFICATION_URL=https://admin.example.com/verify-email?token={token}
AUTOXIDE_AUTH_PASSWORD_RESET_URL=https://admin.example.com/reset-password?token={token}
```

Core đặt token vào chỗ `{token}`. Không đặt thì thư chứa token và bảo người đọc gọi API. Khi chạy
thử, core chưa có máy chủ SMTP thì ghi thư thành file `.eml` vào `AUTOXIDE_MAIL_FILE_DIR` (mặc
định `data/mail`); mở link từ đó. Mở link xác minh chưa làm gì cho tới khi người dùng bấm "Xác
minh email của tôi", để trình quét link của hộp thư (mở thử mọi link) không dùng mất token.

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
- **Thiết bị.** Máy chủ của ứng dụng chuyển `User-Agent` của trình duyệt cho core, nên danh sách
  phiên trong Tài khoản của tôi ghi tên từng thiết bị. Id của phiên cũng được giữ trong cookie
  `httpOnly`, để đánh dấu "phiên này" và giữ nó lại khi đăng xuất mọi thiết bị khác.
- **Passkey.** Thêm passkey chạy WebAuthn ở trình duyệt; options và kết quả đi qua máy chủ của
  ứng dụng. Passkey chỉ dùng được khi core đặt `AUTOXIDE_AUTH_PASSKEY_RP_ID` là tên miền của ứng
  dụng này và `AUTOXIDE_AUTH_PASSKEY_ORIGINS` có địa chỉ của nó (ví dụ
  `https://admin.example.com`).
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
