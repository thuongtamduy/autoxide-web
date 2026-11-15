// Bảng "Trợ giúp" theo trang (thiết kế mục 6): mỗi màn chính có vài bài hướng dẫn ngắn (tiêu đề và một
// câu tóm tắt ở `help.pages.<id>` của `messages/`). Core chưa có API bài hướng dẫn, nên bài là nội dung
// tĩnh; bài có màn liên quan thì trỏ tới màn đó, không có thì chỉ hiện chữ (không có liên kết giả).
import { fold } from "@/lib/fold";

export interface HelpArticle {
  id: string;
  /** Màn liên quan trong ứng dụng; không có thì bài chỉ là chữ. */
  href?: string;
}

export interface HelpPage {
  id: string;
  /** Màn đầu của trang, cũng là nơi bài không có `href` trỏ tới khi hiện trong kết quả tìm. */
  home: string;
  /** Chỉ khớp đúng `home` (Tổng quan); không thì khớp cả mọi màn con (Tổ chức gồm `/org/access`). */
  exact?: boolean;
  articles: readonly HelpArticle[];
  /** Màn kỹ thuật: thêm lối tải tài liệu OpenAPI của core. */
  api?: boolean;
}

/** Id của popover bảng Trợ giúp: nút "?" và "Tìm hiểu thêm" của hộp ⓘ cùng mở nó. */
export const HELP_ID = "help";

/** Tải `openapi.json` của core qua route của ứng dụng (màn Nhà phát triển dùng cùng route). */
export const OPENAPI_DOWNLOAD = "/settings/developers/openapi.json";

export const HELP_PAGES: readonly HelpPage[] = [
  {
    id: "home",
    home: "/",
    exact: true,
    articles: [
      { id: "overview" },
      { id: "work", href: "/work" },
      { id: "scope", href: "/org" },
      { id: "setup", href: "/compliance" },
    ],
  },
  {
    id: "orders",
    home: "/sales/orders",
    articles: [
      { id: "handle" },
      { id: "refunds", href: "/sales/orders/returns" },
      { id: "pos", href: "/sales/orders/pos" },
      { id: "views" },
    ],
  },
  {
    id: "content",
    home: "/content",
    articles: [
      { id: "write" },
      { id: "ai" },
      { id: "required", href: "/compliance/websites" },
      { id: "sites" },
    ],
  },
  {
    id: "org",
    home: "/org",
    articles: [
      { id: "tree" },
      { id: "roles", href: "/org/access/roles" },
      { id: "invite", href: "/org/access/invitations" },
    ],
  },
  {
    id: "compliance",
    home: "/compliance",
    articles: [
      { id: "register", href: "/compliance/websites" },
      { id: "kyc", href: "/compliance/kyc" },
      { id: "requests", href: "/compliance/privacy" },
      { id: "incident", href: "/compliance/privacy" },
    ],
  },
  {
    id: "platform",
    home: "/platform",
    api: true,
    articles: [
      { id: "provision", href: "/platform/provisioning" },
      { id: "placement", href: "/platform/fleet" },
      { id: "migrations", href: "/platform/fleet" },
      { id: "support", href: "/platform/support" },
    ],
  },
  {
    id: "developers",
    home: "/settings/developers",
    api: true,
    articles: [
      { id: "requests", href: "/settings/developers/requests" },
      { id: "deliveries", href: "/settings/developers" },
      { id: "jobs" },
      { id: "idempotency" },
    ],
  },
  {
    id: "apiKeys",
    home: "/settings/api-keys",
    api: true,
    articles: [
      { id: "create", href: "/settings/api-keys/new" },
      { id: "approvals", href: "/settings/api-keys/approvals" },
      { id: "mcp", href: "/settings/api-keys/mcp" },
      { id: "revoke" },
    ],
  },
];

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** Trang trợ giúp của đường dẫn đang mở; `null` khi màn đó chưa có bài riêng. */
export function helpPageOf(pathname: string): HelpPage | null {
  return (
    HELP_PAGES.find((page) => (page.exact ? pathname === page.home : under(pathname, page.home))) ??
    null
  );
}

export interface ArticleText {
  page: string;
  id: string;
  title: string;
  summary: string;
  href: string | null;
}

/**
 * Tìm trong mọi bài (không cần dấu): khớp khi mọi từ của câu tìm có trong tiêu đề, tóm tắt hay tên
 * trang. Bài không có màn riêng trỏ tới màn đầu của trang nó thuộc.
 */
export function searchArticles(
  list: readonly ArticleText[],
  query: string,
  pageName: (id: string) => string,
): ArticleText[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return list
    .filter((a) => {
      const text = fold(`${a.title} ${a.summary} ${pageName(a.page)}`);
      return words.every((w) => text.includes(w));
    })
    .map((a) => ({
      ...a,
      href: a.href ?? HELP_PAGES.find((p) => p.id === a.page)?.home ?? null,
    }));
}
