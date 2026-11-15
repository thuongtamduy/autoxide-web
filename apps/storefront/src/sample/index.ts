// Dữ liệu mẫu của website cho phần core chưa có API (W-006, W-026): sản phẩm, giá, tồn theo cửa
// hàng, giỏ hàng, cửa hàng, người bán, khuyến mại. Mọi dữ liệu mẫu và hàm giả của website nằm trong
// thư mục này, mỗi phân hệ một file; hàm có cùng chữ ký như sẽ gọi API công khai của core (đặc tả
// bước 34, 41–46), kèm comment "Thay bằng …". Phần core đã có API (nội dung, menu, bình luận, bản
// tin) không bao giờ dùng dữ liệu mẫu — riêng menu: khi core chưa có menu `main` / `footer` thì
// dùng menu mẫu (`menus.ts`) để website không trống đầu trang.
//
// Dữ liệu khớp với dữ liệu mẫu của trang quản trị (`apps/admin/src/sample/catalog.ts`,
// `inventory.ts`, `org.ts`, `promotions.ts`, `market-data.ts`): cùng ID, SKU, tên, giá, danh mục,
// cửa hàng. Chép phần tối thiểu, không import chéo app; đổi bên kia thì đổi cả ở đây.
//
// Trên website công khai, dấu "mẫu" kín đáo (`SampleMark`) và một dải thông báo đầu trang
// (`SampleNotice`) thay cho nhãn lớn của trang quản trị. Tắt dữ liệu mẫu thì các khối thương mại
// tự ẩn: trang chỉ còn phần đọc từ core.
import { sampleDataSetting } from "@/lib/env";

/** Có hiện phần dùng dữ liệu mẫu không (`AUTOXIDE_WEB_SAMPLE_DATA`). */
export function sampleDataEnabled(): boolean {
  return sampleDataSetting();
}

/** Chữ theo ngôn ngữ, như cột JSON `names` của đặc tả. */
export type Localized = { vi: string; en: string };

/** Chữ của một ngôn ngữ (ngôn ngữ lạ thì tiếng Việt, ngôn ngữ mặc định của khách mẫu). */
export function text(value: Localized, locale: string): string {
  return locale === "en" ? value.en : value.vi;
}

/** ID cố định như dữ liệu mẫu của trang quản trị (`uid` của `catalog.ts`). */
export const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;
