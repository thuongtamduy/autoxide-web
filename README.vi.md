# Autoxide Web

Giao diện quản trị và website bán hàng công khai của [Autoxide](https://github.com/thuongtamduy/autoxide),
lõi backend viết bằng Rust. Cả hai chỉ gọi REST API công khai của core. Trang quản trị cần một tài
khoản core đã đăng nhập; website bán hàng (xem [Website bán hàng](#website-bán-hàng)) ai cũng mở được.

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
  lọc bài chờ duyệt, bài của tôi, bài có nhãn AI, bài thiếu bản dịch, và lịch sắp đăng của mọi bài;
  trang, danh mục, thẻ, tác giả (kèm số bài) và chuyển hướng; **menu của website** (thanh danh mục,
  bảng xổ lớn, chân trang; mục trỏ tới bài, danh mục hay địa chỉ; xem trước mặt tiền); **thư viện
  media** (tải lên, thư mục, thẻ, alt theo từng ngôn ngữ kèm gợi ý của AI, ảnh trang trí, tóm tắt cả
  thư viện, thùng rác).
- **Tiếp thị**: biểu mẫu và bài nộp (số bài theo trạng thái, xuất CSV, xuất nền cho form nhiều bài
  nộp), danh sách, chiến dịch (thư đúng như khi gửi, số bị trả về và huỷ đăng ký) và người nhận bản
  tin, duyệt bình luận (chữ thường hay Markdown) và các bài có bình luận.
- **Tổ chức › Người dùng và role**: tài khoản kèm role, lọc theo trạng thái và lần đăng nhập gần nhất,
  role với bộ chọn permission (permission rủi ro có nhãn), đặt mật khẩu đầu tiên và tắt xác thực hai
  bước chỉ khi cần, đăng xuất mọi nơi, gỡ passkey của người mất thiết bị; hồ sơ công khai của các nút
  (tên, địa chỉ theo danh mục hành chính chính thức, giờ mở cửa, nhận tại quầy) hiện trên website; role
  với độ sâu cho từng permission (bản ghi của mình, nút, nút và các nút dưới, cả khách) và "bắt buộc xác
  thực hai bước"; role của một người ở các nút khác; mời qua email (và trang nhận lời mời), uỷ quyền
  cho khách con, quyền vào hỗ trợ của nhân sự nền tảng (thu hồi, tắt).
- **Cài đặt › Gói và thuê bao**: gói đang dùng, mức dùng từng hạn mức, kỳ thanh toán, đổi gói (gói lớn
  hơn có hiệu lực ngay, nhỏ hơn chờ hết kỳ), huỷ và tiếp tục gia hạn. **Nền tảng › Gói và giá**: gói với
  module, tính năng, hạn mức và giá, bán, gói mặc định, ngừng bán; ghi đè theo khách (có Hoàn tác);
  thuê bao của mọi khách (đổi gói, huỷ, khoá hẳn).
- **Đăng nhập bằng link qua email** và **Tài khoản › Hồ sơ**: tên, ngôn ngữ và múi giờ ưa thích, nơi
  bạn làm việc (các nút và role của bạn, các khách bạn làm việc được).
- **Cây tổ chức**: các nút theo loại, ai làm việc ở mỗi nút (cả người được gán ở nút trên), cài đặt
  đang có hiệu lực kèm nút đặt nó, thêm nút con có Hoàn tác. Bộ chọn nút ở góc trên trái thu hẹp bài,
  media, form và menu về một nút (cái tạo mới thuộc nút đó).
- **Cài đặt**: tên miền riêng (bản ghi TXT cần tạo, kiểm tra ngay, kết quả kiểm lại hằng ngày, gỡ; bản
  cài một khách thì giải thích thay vì báo lỗi), module, cài đặt theo khách, webhook (kèm lần giao gần nhất), nhật ký audit, API key và
  AI agent (MCP; xác nhận key mới bằng mật khẩu, mã của app xác thực hay passkey; quản trị viên xem và
  thu hồi key của mọi người), công cụ cho lập trình viên.
- **Tài khoản của tôi**: hồ sơ, email và mật khẩu (huỷ yêu cầu đổi email đang chờ; tài khoản chưa có
  mật khẩu nhận link để đặt), xác thực hai bước, passkey kèm loại thiết bị, thiết bị kèm cách đăng nhập
  và quốc gia, dữ liệu của bạn.
- **Mặt điều khiển nền tảng › Khách hàng và Đội database**: khách và placement của core (kèm nơi lưu
  file riêng của placement, không bao giờ có khoá); thêm, đổi tên, tạm khoá và mở lại một khách; dời
  khách sang placement khác (chạy thử nêu bảng, số dòng, file và lý do chặn, rồi dời bằng job nền và
  theo dõi tới xong).
- **Trang mở từ mail** (không cần đăng nhập): xác nhận email, quên và đặt lại mật khẩu, và "không phải
  tôi" khi người khác đổi email của bạn.

**Các màn dùng dữ liệu mẫu** (có nhãn "Dữ liệu mẫu · chờ API bước N"), vì core dựng chúng ở các bước
sau: Bán hàng (đơn hàng, đổi trả, bán tại quầy, vận chuyển và COD, cửa hàng, kênh bán), Sản phẩm
(danh mục, giá, nhóm thuế, tồn kho), Tiếp thị (khuyến mại, tiếp thị liên kết), Khách hàng, Sàn và
Trung tâm người bán, Tài chính (sổ cái, hoá đơn điện tử, thuế), Tuân thủ và phần còn lại
của Mặt điều khiển nền tảng (cấp phát, sức khoẻ, vào dữ liệu khách). Phần nào của màn thật mà core chưa có API cũng dùng dữ liệu mẫu theo cùng cách. Dữ
liệu mẫu chỉ hiện khi bật `AUTOXIDE_WEB_SAMPLE_DATA` (mặc định bật, trừ production); thay đổi ở đó nằm
trong bộ nhớ của ứng dụng và mất khi khởi động lại. Bản ghi mẫu khớp nhau giữa các màn (một đơn hàng,
vận đơn, bút toán và hoá đơn của nó là cùng một đơn).

Chạy với core Autoxide từ commit `5b35b99` của nhánh `main` trở lên (bản phát hành kế tiếp, v0.15.0,
sẽ có).

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

| Biến                          | Mặc định                    | Ý nghĩa                                                                                                                                                                                                                                    |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTOXIDE_API_URL`            | `http://127.0.0.1:8080`     | Địa chỉ của core, không có `/api/v1`. Chỉ máy chủ của ứng dụng này gọi tới; trình duyệt không bao giờ gọi.                                                                                                                                 |
| `AUTOXIDE_WEB_SECURE_COOKIES` | `true` khi chạy production  | Chỉ gửi cookie phiên qua HTTPS. Chỉ tắt khi phục vụ qua HTTP thường.                                                                                                                                                                       |
| `AUTOXIDE_WEB_SAMPLE_DATA`    | `false` khi chạy production | Hiện các màn và tab dùng dữ liệu mẫu trong lúc core chưa có API cho chúng.                                                                                                                                                                 |
| `AUTOXIDE_ADMIN_TENANT`       | trống                       | Chỉ cho core chạy nhiều khách: slug hay ID của khách duy nhất mà trang quản trị này phục vụ. Để trống: form đăng nhập hỏi không gian làm việc khi core cần (nhớ cho lần sau), hoặc core nhận khách theo tên miền đang chạy trang quản trị. |

### Link trong thư

Core gửi thư xác minh email, thư đặt lại mật khẩu, và báo tới địa chỉ cũ khi email của tài khoản bị
đổi. Đặt các biến này **ở core** để link trong thư mở ứng dụng này (thay địa chỉ bằng nơi ứng dụng
chạy):

```bash
AUTOXIDE_AUTH_EMAIL_VERIFICATION_URL=https://admin.example.com/verify-email?token={token}
AUTOXIDE_AUTH_PASSWORD_RESET_URL=https://admin.example.com/reset-password?token={token}
AUTOXIDE_AUTH_EMAIL_CHANGE_REPORT_URL=https://admin.example.com/not-me?token={token}
AUTOXIDE_AUTH_INVITATION_URL=https://admin.example.com/invitation?token={token}
AUTOXIDE_AUTH_LOGIN_LINK_URL=https://admin.example.com/sign-in/link?token={token}
# Đăng nhập bằng link qua email tắt cho tới khi core bật:
AUTOXIDE_AUTH_LOGIN_LINK=true
```

Core đặt token vào chỗ `{token}`. Không đặt thì thư chứa token và bảo người đọc gọi API. Khi chạy
thử, core chưa có máy chủ SMTP thì ghi thư thành file `.eml` vào `AUTOXIDE_MAIL_FILE_DIR` (mặc
định `data/mail`); mở link từ đó. Mở link xác minh chưa làm gì cho tới khi người dùng bấm "Xác
minh email của tôi", để trình quét link của hộp thư (mở thử mọi link) không dùng mất token. Trang
`/not-me` cũng vậy: tài khoản chỉ bị khoá khi người dùng bấm "Không phải tôi".

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

Ứng dụng này gọi core thay cho mọi người đang dùng nó. Nếu không cấu hình thêm, core chỉ thấy một
địa chỉ cho tất cả mọi người, là địa chỉ của máy chủ chạy ứng dụng. Khi đó mọi người dùng chung
một hạn mức request (`AUTOXIDE_HTTP_RATE_LIMIT_PER_MINUTE`, mặc định 600 mỗi phút, mà mỗi trang
gọi khoảng mười lần). Phần chống dò mật khẩu và danh sách phiên của core cũng không phân biệt
được ai với ai. Ứng dụng chuyển tiếp header `X-Forwarded-For` mà nó nhận được. Muốn core dùng
header đó, đặt các biến này **ở core**:

```bash
AUTOXIDE_HTTP_CLIENT_IP_HEADER=X-Forwarded-For
# Số proxy ghi thêm địa chỉ vào header trước khi tới core: 1 khi có một reverse proxy đứng trước
# ứng dụng này, 2 khi trước proxy đó còn một CDN.
AUTOXIDE_HTTP_TRUSTED_PROXY_COUNT=1
```

Đặt một reverse proxy (nginx, Caddy) trước ứng dụng để ghi địa chỉ người dùng vào
`X-Forwarded-For`. Nếu người dùng vào thẳng ứng dụng, họ có thể tự điền địa chỉ bất kỳ vào header
này, và mỗi địa chỉ lại có một hạn mức mới. Không có proxy thì để tắt biến này ở core.

## Website bán hàng

`apps/storefront` là website công khai của một cửa hàng (quyết định D-200 của core): trang chủ,
danh mục, sản phẩm, giỏ và đặt hàng, gian hàng người bán, bài viết có gắn sản phẩm, tài khoản người
mua; blog là một mục trong đó. Website theo các bảng mặt tiền của bản thiết kế Autoxide (thanh danh
mục có bảng xổ, lưới cân đối, số tiền không bao giờ bị bẻ dòng), có sáng và tối, và bốn kiểu giao
diện (`AUTOXIDE_STOREFRONT_THEME`).

- **Dùng API thật của core** (chỉ endpoint công khai, máy chủ của website gọi): menu đầu trang và
  chân trang (`main`, `footer`), blog có danh mục, thẻ, tác giả và phân trang, bài viết và trang tĩnh
  ở mọi địa chỉ core biết (kể cả chuyển hướng), bình luận dưới bài (khách viết được khi core cho
  phép), tìm trong bài viết và trang, đăng ký bản tin và các trang mà thư của nó trỏ tới, xem trước
  bản nháp, `sitemap.xml`, `robots.txt` và RSS. Trang "Bán trên sàn" (`/ban-tren-cho`) dùng biểu mẫu
  công khai của core có khoá `ban-tren-cho` khi cửa hàng đã tạo, chưa có thì dùng form mẫu.
- **Trang người mua và sàn** (mẫu, xem quyết định W-030): giỏ chia theo nơi bán (`/gio-hang`), đặt
  hàng có giao tận nơi, nhận tại cửa hàng, điểm, chuyển khoản QR / thẻ / trả khi nhận và hoá đơn công
  ty (`/thanh-toan`), trang đặt hàng thành công, tra cứu đơn bằng mã đơn và số điện thoại không cần
  tài khoản (`/tra-cuu-don-hang`), tài khoản người mua có đơn hàng, đổi trả, đã lưu, điểm, sổ địa chỉ
  và quyền với dữ liệu cá nhân (`/tai-khoan`, đăng nhập bằng mã qua số điện thoại, không có mật khẩu),
  trang sàn và gian hàng người bán kèm thông tin người bán bắt buộc công khai (`/nguoi-ban`,
  `/nguoi-ban/<slug>`). Không thu tiền, không giao hàng thật; core không bao giờ giữ tiền của người mua
  (thanh toán qua đối tác có giấy phép).
- **Dùng dữ liệu mẫu** (có dấu "mẫu" nhỏ và một dải thông báo) tới khi core có API: sản phẩm, giá,
  mã giảm giá, tồn theo cửa hàng, cửa hàng, giỏ hàng, người bán. Các trang dựng trên đó: tất cả sản
  phẩm và danh mục sản phẩm (`/danh-muc`, `/danh-muc/<slug>`: lọc chất liệu, loại bếp, giá, đánh giá,
  nơi bán, "có sẵn ở cửa hàng của tôi", sáu cách sắp, chia trang), trang sản phẩm (`/san-pham/<slug>`:
  bộ ảnh, lựa chọn, giá niêm yết kèm giá với mã và giá tham chiếu của flash sale, ngày giao và tồn theo
  cửa hàng, đánh giá có bộ lọc, hỏi đáp, thông tin người bán và pháp lý, JSON-LD), khuyến mại
  (`/khuyen-mai`: đếm ngược flash sale, mã giảm giá, chương trình tự áp, thông báo khuyến mại) và
  livestream (`/livestream`: phiên đang phát, sản phẩm đang ghim, lịch phát). Ô tìm ở đầu trang gợi ý
  từ khoá, danh mục, sản phẩm, bài viết và cửa hàng. Tắt dữ liệu mẫu thì các khối này ẩn, website chỉ
  còn phần core phục vụ. Menu core chưa có thì dùng menu mẫu khi bật dữ liệu mẫu.
- **Ngôn ngữ trên địa chỉ**: tiếng Việt ở `/`, tiếng Anh dưới `/en`, có link `hreflang`.

Chạy cạnh trang quản trị:

```bash
cp apps/storefront/.env.example apps/storefront/.env.local   # rồi sửa nếu cần
pnpm --filter @autoxide/storefront dev                       # http://localhost:3300
```

| Biến                         | Mặc định                | Ý nghĩa                                                                                                                                                     |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTOXIDE_API_URL`           | `http://127.0.0.1:8080` | Địa chỉ của core, không có `/api/v1`. Trình duyệt không gọi trực tiếp.                                                                                      |
| `AUTOXIDE_STOREFRONT_URL`    | tên miền đang mở        | Địa chỉ công khai của website: link canonical, sitemap, RSS. Trống: tên miền người đọc đang mở.                                                             |
| `AUTOXIDE_STOREFRONT_NAME`   | cửa hàng mẫu / Autoxide | Tên cửa hàng khi hồ sơ công khai của nút gốc không công khai.                                                                                               |
| `AUTOXIDE_STOREFRONT_THEME`  | `default`               | Kiểu giao diện: `default`, `market`, `minimal` hoặc `luxe`.                                                                                                 |
| `AUTOXIDE_STOREFRONT_TENANT` | trống                   | Khách (slug hay ID) của core chạy nhiều khách; trống: chọn theo tên miền người đọc mở (cần máy chủ này nằm trong `AUTOXIDE_HTTP_TRUSTED_PROXIES` của core). |
| `AUTOXIDE_WEB_SAMPLE_DATA`   | `false` khi chạy thật   | Hiện các khối bán hàng dùng dữ liệu mẫu.                                                                                                                    |

Đặt các biến này **ở core** để thư của core trỏ về website:

```bash
AUTOXIDE_NEWSLETTER_CONFIRM_URL=https://www.example.com/newsletter/confirm?token={token}
AUTOXIDE_NEWSLETTER_PREFERENCES_URL=https://www.example.com/newsletter/preferences?token={token}
AUTOXIDE_NEWSLETTER_SITE_URL=https://www.example.com
AUTOXIDE_COMMENTS_VERIFY_URL=https://www.example.com/comments/verify?token={token}
AUTOXIDE_COMMENTS_UNSUBSCRIBE_URL=https://www.example.com/comments/unsubscribe?token={token}
AUTOXIDE_COMMENTS_SITE_URL=https://www.example.com
```

Máy chủ của website gửi bình luận và đăng ký bản tin tới core thay cho người đọc, kèm header
`X-Forwarded-For` nó nhận được, để core giới hạn theo địa chỉ của người đọc: đặt website sau một
reverse proxy có gắn header đó, và khai máy chủ website trong `AUTOXIDE_HTTP_TRUSTED_PROXIES` của
core (cùng `AUTOXIDE_HTTP_CLIENT_IP_HEADER=X-Forwarded-For`). Ô đăng ký bản tin hiện khi core có ít
nhất một danh sách công khai. Bản nháp xem trước ở
`/preview?token=…`. Chạy thật: `pnpm build`, rồi
`PORT=3000 AUTOXIDE_API_URL=… AUTOXIDE_STOREFRONT_URL=… pnpm --filter @autoxide/storefront start`,
hoặc `docker build --build-arg APP=storefront -t autoxide-storefront .`.

### Nhiều cửa hàng trên một website

Với core chạy nhiều khách (`AUTOXIDE_TENANCY_MODE=multi`), một website phục vụ được mọi cửa hàng,
mỗi cửa hàng trên tên miền của nó:

1. Để trống `AUTOXIDE_STOREFRONT_TENANT` và `AUTOXIDE_STOREFRONT_URL`. Website khi đó báo core tên
   miền người đọc đang mở (`X-Forwarded-Host`), và link canonical, sitemap, RSS dùng đúng tên miền đó.
2. Ở core, thêm máy chủ của website vào `AUTOXIDE_HTTP_TRUSTED_PROXIES`: core chỉ đọc tên miền được
   chuyển tiếp từ proxy nó tin.
3. Mỗi cửa hàng thêm và xác minh tên miền của mình ở trang quản trị (**Cài đặt › Tên miền**).
4. Để Caddy chỉ xin chứng chỉ cho tên miền đã xác minh, và chuyển chúng tới website thay vì core:

```text
{
    on_demand_tls {
        ask http://127.0.0.1:8080/api/v1/kernel/domains/allowed
    }
}

api.example.com {
    reverse_proxy 127.0.0.1:8080
}

https:// {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:3000
}
```

Caddy chuyển tiếp `Host` của người đọc và đặt `X-Forwarded-Proto`, website chỉ cần vậy. Dùng reverse
proxy khác thì cũng cho nó đặt `X-Forwarded-Proto`: thiếu header này, máy chủ Next.js coi là `http` và link
canonical sẽ bắt đầu bằng `http://`. Tên miền chưa cửa hàng nào xác minh nhận trang "không tìm thấy" (404)
của website. Tên cửa hàng ở
đầu trang lấy từ hồ sơ công khai của nút gốc của khách (Tổ chức › Người dùng và role › Hồ sơ công khai, bật
"Hiện trên website"); hồ sơ đó không công khai thì lấy từ `AUTOXIDE_STOREFRONT_NAME`.

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
pnpm e2e           # Playwright cho cả hai app, chạy với một core giả (apps/admin/e2e/mock-core.ts)
```

Test e2e cần Chromium: chạy `pnpm --filter @autoxide/admin exec playwright install chromium`,
hoặc đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ tới một bản có sẵn.

## Bố cục

| Đường dẫn           | Nội dung                                                 |
| ------------------- | -------------------------------------------------------- |
| `apps/admin`        | Ứng dụng quản trị (Next.js, App Router)                  |
| `apps/storefront`   | Website bán hàng công khai (Next.js, App Router)         |
| `packages/sdk`      | Client và kiểu dữ liệu sinh từ tài liệu OpenAPI của core |
| `docs/DECISIONS.md` | Nhật ký quyết định (tiếng Việt)                          |

## Giấy phép

Hai giấy phép như core: [MIT](LICENSE-MIT) hoặc [Apache-2.0](LICENSE-APACHE), tuỳ bạn chọn.
