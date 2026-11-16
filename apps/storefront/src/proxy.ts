// Proxy (tên mới của middleware từ Next.js 16): chạy trước mỗi request tới trang.
//
// Việc duy nhất: định tuyến theo ngôn ngữ của next-intl — `/` là tiếng Việt (viết lại thành
// `/vi` bên trong), `/en/…` là tiếng Anh, `/vi/…` chuyển về địa chỉ không tiền tố. Website công
// khai không có phiên đăng nhập: không đọc, không đặt token nào ở đây.
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Mọi trang, trừ API (ảnh của core đi qua `/api/v1/media/…`), file của Next.js và file tĩnh
  // (có dấu chấm). `feed.xml` có ngôn ngữ trên địa chỉ nên vẫn qua proxy. `proxy.test.ts` kiểm.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/feed.xml", "/en/feed.xml"],
};
