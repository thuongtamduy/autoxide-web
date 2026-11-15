// Đường dẫn của website, một chỗ duy nhất. Không có tiền tố ngôn ngữ: `Link` của
// `@/i18n/navigation` tự thêm `/en` cho trang tiếng Anh.
//
// Đường dẫn của trang nội dung (bài viết, trang tĩnh) do core quyết (`path` của bài, vd
// `/blog/<slug>`) và hiện qua trang bắt mọi địa chỉ `app/[locale]/[...path]`. Đường dẫn phần thương
// mại theo thói quen website Việt Nam (`/danh-muc`, `/san-pham`, `/gio-hang`), giống menu mẫu của
// trang quản trị; hai agent làm tiếp trang thương mại thêm trang ở đúng các đường dẫn này.
export const routes = {
  home: () => "/",
  // Nội dung (core thật).
  blog: () => "/blog",
  term: (taxonomy: string, slug: string) => `/blog/${taxonomy}/${encodeURIComponent(slug)}`,
  author: (slug: string) => `/blog/author/${encodeURIComponent(slug)}`,
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  // Thương mại (dữ liệu mẫu tới khi core có bước 41–46).
  catalog: () => "/danh-muc",
  category: (slug: string) => `/danh-muc/${encodeURIComponent(slug)}`,
  product: (slug: string) => `/san-pham/${encodeURIComponent(slug)}`,
  cart: () => "/gio-hang",
  checkout: () => "/thanh-toan",
  account: () => "/tai-khoan",
  orderLookup: () => "/tra-cuu-don-hang",
  deals: () => "/khuyen-mai",
  live: () => "/livestream",
  marketplace: () => "/nguoi-ban",
  seller: (slug: string) => `/nguoi-ban/${encodeURIComponent(slug)}`,
  sellOn: () => "/ban-tren-cho",
  stores: () => "/#stores",
} as const;
