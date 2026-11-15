# Autoxide Web

Giao diện quản trị của [Autoxide](https://github.com/thuongtamduy/autoxide), lõi backend viết
bằng Rust. Giao diện chỉ gọi REST API công khai của core. Các trang của nó cần một tài khoản
core đã đăng nhập.

[English](README.md)

## Trạng thái

Khung quản trị theo bản thiết kế quản trị của Autoxide: thanh phân hệ (thanh đáy trên điện
thoại), menu các màn của từng phân hệ, bảng lệnh (Ctrl K / ⌘K) và giao diện sáng, tối hoặc theo
máy. Một phân hệ chỉ hiện khi module của nó đã cài trên core và role của bạn có permission của nó.

Các màn đã có:

- **Tổng quan**: các phân hệ bạn dùng được.
- **Cài đặt › Cài đặt chung**, mỗi việc một tab:
  - **Module**: các module đã cài trên máy chủ core và những gì mỗi module khai: permission, event,
    job, lịch chạy, tool MCP, endpoint deprecated và trạng thái migration. Chỉ xem: module được
    biên dịch cùng core, nên cài hay gỡ một module nghĩa là build lại core.
  - **Webhook**: thêm endpoint nhận event (secret ký chỉ hiện một lần), chọn event, tắt và bật,
    đổi secret, xoá và xem từng lần giao. Cần `webhooks.manage`.
  - **Nhật ký audit**: ai đổi gì, lúc nào, lọc theo module, việc, bản ghi hay người làm, kèm trạng
    thái trước và sau. Cần `audit.read`.
  - **Nhân sự** là link sang Tổ chức › Người dùng và role.
- **Cài đặt › API key và AI agent**: tạo key cho chương trình và AI agent với đúng permission cần
  và ngày hết hạn (khoá chỉ hiện một lần, kèm lệnh `curl` để thử), thu hồi key, và kết nối AI agent
  với endpoint MCP của core. Mọi tài khoản đã đăng nhập tự quản lý key của mình.
- **Cài đặt › Nhà phát triển**: các lần giao webhook gần đây của mọi endpoint, tài liệu OpenAPI
  của core và trang tài liệu API (khi core bật).
- **Tài khoản của tôi** (menu tài khoản, hoặc Ctrl K): hồ sơ và xác minh email, đổi email hay
  mật khẩu, xác thực hai bước bằng ứng dụng xác thực và mã khôi phục, passkey, các thiết bị đang
  đăng nhập, tải dữ liệu của bạn và xoá tài khoản. Mọi tài khoản đã đăng nhập đều mở được, không
  cần permission.
- **Tổ chức › Người dùng và role**: tìm và lật trang danh sách tài khoản kèm role và trạng thái;
  tạo tài khoản, đổi tên, khoá hay mở khoá, gán role, đặt mật khẩu đầu tiên, gửi thư đặt lại mật
  khẩu, đăng xuất ở mọi thiết bị, tắt xác thực hai bước hay xoá (mỗi thao tác rủi ro đều hỏi lại
  và nêu hệ quả). Role: tạo và sửa bằng bộ chọn permission nhóm theo module, có ô tìm; role dựng
  sẵn `admin` chỉ xem. Cần `auth.users.read` hoặc `auth.roles.read`; sửa cần
  `auth.users.manage` / `auth.roles.manage`.
- **Trang mở từ thư** (không cần đăng nhập): `/verify-email` xác minh email, `/forgot-password`
  xin thư đặt lại mật khẩu và `/reset-password` chọn mật khẩu mới. Trỏ link trong thư của core
  về đây (xem [Link trong thư](#link-trong-thư)).

Phần của bản thiết kế mà core chưa có API (lời mời, uỷ quyền, hồ sơ công khai của cửa hàng,
quyền vào hỗ trợ; gói và thuê bao, tên miền, kết nối đối tác, job; lệnh agent chờ duyệt; nhật ký
request và event theo bản ghi) hiện bằng **dữ liệu mẫu**, có nhãn "Dữ liệu mẫu · chờ API bước N". Chúng chỉ
hiện khi bật `AUTOXIDE_WEB_SAMPLE_DATA` (mặc định bật khi không chạy production); thay đổi ở đó chỉ
giữ trong bộ nhớ của ứng dụng, mất khi khởi động lại.

Chạy với core Autoxide **v0.12.0** trở lên.

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
