// Phần công khai của core giả cho website (`apps/storefront`): nội dung đã đăng (danh sách bài,
// địa chỉ, danh mục, tác giả, tìm kiếm, sitemap, feed), bình luận của khách, đăng ký bản tin, token
// chống spam. Không cần đăng nhập, như core. Hình dạng theo `openapi.json` (`satisfies` kiểu của SDK).
//
// Dữ liệu riêng, không dùng chung với `mock-content.ts` (màn Nội dung của trang quản trị): test của
// trang quản trị và của website không làm lệch dữ liệu của nhau. Menu công khai đã có ở `mock-menus.ts`.
//
// - 14 bài tiếng Việt đã đăng (hơn một trang 12 bài của website) và 1 bài tiếng Anh là bản dịch của
//   bài đầu; bài đầu có mục lục, bảng, danh mục "Chọn mua", thẻ "chảo gang", tác giả Thu Hà;
// - `/blog/bai-cu` chuyển (308) tới bài đầu; `/blog/da-go` đã gỡ hẳn (410); trang tĩnh `/ve-chung-toi`;
// - bản tin: danh sách công khai `weekly` (xác nhận qua thư); token xác nhận hợp lệ: `ok-token`;
// - `POST /__storefront/search` (`{"enabled": false}`) tắt tìm theo nghĩa cho khách, như core mặc định;
// - `POST /__storefront/reset` đưa mọi thứ về ban đầu.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json, problem, type Schemas, send, text } from "./mock-http.ts";

type Entry = Schemas["PublicEntryResponse"];
type Comment = Schemas["PublicComment"];

const AUTHORS: Schemas["PublicAuthor"][] = [
  {
    id: "01a1f000-0000-7000-8000-00000000a001",
    display_name: "Thu Hà",
    slug: "thu-ha",
    avatar_media_id: null,
  },
  {
    id: "01a1f000-0000-7000-8000-00000000a002",
    display_name: "Minh Anh",
    slug: "minh-anh",
    avatar_media_id: null,
  },
];
type Term = Schemas["PublicTerm"] & { description: string };
const TERMS: [Term, Term, Term] = [
  {
    id: "01a1f000-0000-7000-8000-00000000b001",
    taxonomy: "category",
    name: "Chọn mua",
    slug: "chon-mua",
    locale: "vi",
    description: "Chọn dụng cụ bếp hợp với món bạn nấu.",
  },
  {
    id: "01a1f000-0000-7000-8000-00000000b002",
    taxonomy: "category",
    name: "Mẹo dùng",
    slug: "meo-dung",
    locale: "vi",
    description: "",
  },
  {
    id: "01a1f000-0000-7000-8000-00000000b003",
    taxonomy: "tag",
    name: "chảo gang",
    slug: "chao-gang",
    locale: "vi",
    description: "",
  },
];

const text_ = (value: string, marks?: Schemas["BodyMark"][]): Schemas["BodyNode"] => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const para = (...content: Schemas["BodyNode"][]): Schemas["BodyNode"] => ({
  type: "paragraph",
  content,
});
const heading = (value: string): Schemas["BodyNode"] => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text_(value)],
});

const FIRST_BODY: Schemas["BodyNode"] = {
  type: "doc",
  content: [
    para(text_("Mỗi loại chảo mạnh ở một kiểu nấu.")),
    heading("Chảo gang: giữ nhiệt"),
    para(text_("Gang giữ nhiệt lâu, hợp "), text_("áp chảo", [{ type: "bold" }]), text_(".")),
    heading("Chảo inox 3 lớp"),
    para(
      text_("Xem thêm "),
      text_("cách vệ sinh thớt", [{ type: "link", attrs: { href: "/blog/ve-sinh-thot-go" } }]),
      text_("."),
    ),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [para(text_("Loại"))] },
            { type: "tableHeader", content: [para(text_("Giữ nhiệt"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [para(text_("Gang"))] },
            { type: "tableCell", content: [para(text_("Rất tốt"))] },
          ],
        },
      ],
    },
  ],
};

let entries: Entry[] = [];
/** Tìm theo nghĩa cho khách (`AUTOXIDE_CONTENT_PUBLIC_SEMANTIC_SEARCH` của core); `POST /__storefront/search`. */
let semanticSearch = true;
let comments: Comment[] = [];
const confirmed = new Set<string>();

function entry(n: number, fields: Partial<Entry> & { title: string; slug: string }): Entry {
  const id = `01a1f000-0000-7000-8000-${String(1000 + n).padStart(12, "0")}`;
  const at = new Date(Date.parse("2026-11-14T03:00:00Z") - n * 86_400_000).toISOString();
  return {
    id,
    kind: "post",
    locale: "vi",
    translation_group_id: id,
    parent_id: null,
    path: `/blog/${fields.slug}`,
    excerpt: "",
    body: { type: "doc", content: [para(text_(`Nội dung của bài ${fields.title}.`))] },
    body_schema_version: 1,
    word_count: 120,
    reading_time_minutes: 1,
    body_media: [],
    featured_media: null,
    seo: {
      meta_title: "",
      meta_description: "",
      canonical_url: "",
      noindex: false,
      og_image: null,
    },
    published_at: at,
    first_published_at: at,
    content_modified_at: at,
    translations: [],
    terms: [],
    authors: [AUTHORS[1] as Schemas["PublicAuthor"]],
    ai_generated: false,
    ai_reviewed: false,
    ...fields,
  };
}

export function resetStorefront() {
  const [buy, tips, tag] = TERMS.map(({ description: _, ...term }) => term) as [
    Schemas["PublicTerm"],
    Schemas["PublicTerm"],
    Schemas["PublicTerm"],
  ];
  const first = entry(0, {
    title: "Chảo gang, chảo inox hay chống dính",
    slug: "chao-gang-chao-inox",
    excerpt: "Chọn chảo theo món bạn nấu nhiều nhất.",
    body: FIRST_BODY,
    reading_time_minutes: 6,
    terms: [buy, tag],
    authors: [AUTHORS[0] as Schemas["PublicAuthor"]],
    translations: [{ locale: "en", path: "/blog/cast-iron-or-stainless" }],
  });
  const english = entry(0, {
    locale: "en",
    title: "Cast iron, stainless or non-stick",
    slug: "cast-iron-or-stainless",
    translation_group_id: first.id,
    id: "01a1f000-0000-7000-8000-000000009999",
    excerpt: "Choose the pan for the dish you cook most.",
    translations: [{ locale: "vi", path: first.path }],
    terms: [],
  });
  const rest = Array.from({ length: 13 }, (_, i) =>
    entry(i + 1, {
      title: i === 0 ? "Vệ sinh thớt gỗ đúng cách" : `Mẹo bếp số ${i + 1}`,
      slug: i === 0 ? "ve-sinh-thot-go" : `meo-bep-so-${i + 1}`,
      terms: [tips],
    }),
  );
  const page = entry(30, {
    kind: "page",
    title: "Về chúng tôi",
    slug: "ve-chung-toi",
    path: "/ve-chung-toi",
    authors: [],
  });
  entries = [first, ...rest, english, page];
  comments = [
    {
      id: "01a1f000-0000-7000-8000-00000000c001",
      target_type: "content.entry",
      target_id: first.id,
      root_id: "01a1f000-0000-7000-8000-00000000c001",
      parent_id: null,
      reply_to_id: null,
      author: { kind: "guest", name: "Lan Chi" },
      badges: ["verified_buyer"],
      body: "Chảo gang nhà mình dùng 3 năm rồi.",
      body_html: "Chảo gang nhà mình dùng 3 năm rồi.",
      format: "text",
      deleted: false,
      created_at: "2026-11-14T08:00:00Z",
      edited_at: null,
      reply_count: 0,
    },
  ];
  confirmed.clear();
  semanticSearch = true;
}
resetStorefront();

function published(locale: string | null, kind?: string): Entry[] {
  return entries.filter((e) => (!locale || e.locale === locale) && (!kind || e.kind === kind));
}

/** Một trang theo con trỏ (id của dòng cuối trang trước), như `fetch_page` của core. */
function pageOf<T extends { id: string }>(items: T[], url: URL, fallback = 50) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? fallback) || fallback, 200);
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0;
  const data = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return { data, pagination: { limit, next_cursor: more ? (data.at(-1)?.id ?? null) : null } };
}

function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/đ/g, "d").replace(/[̀-ͯ]/g, "");
}

function threadOf(comment: Comment): Schemas["Page_ThreadComment"]["data"][number] {
  const replies = comments.filter((c) => c.parent_id === comment.id);
  return { ...comment, reply_count: replies.length, replies: replies.slice(0, 3) };
}

/** Trả `true` khi đã trả lời request. */
export async function storefrontRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<boolean> {
  const path = url.pathname;
  if (route === "POST /__storefront/reset") {
    resetStorefront();
    send(response, 204);
    return true;
  }
  if (route === "GET /api/v1/antispam/token") {
    const now = Date.now();
    send(response, 200, {
      data: {
        token: randomUUID(),
        expires_at: new Date(now + 3_600_000).toISOString(),
        submit_after: new Date(now).toISOString(),
        challenge: null,
      },
    } satisfies Schemas["Data_FormTokenResponse"]);
    return true;
  }

  // ------------------------------------------------------------ content
  if (route === "GET /api/v1/content/public/posts") {
    const locale = url.searchParams.get("locale");
    if (!locale) {
      problem(
        response,
        400,
        "bad_request",
        "Failed to deserialize query string: missing field `locale`",
      );
      return true;
    }
    const term = url.searchParams.get("term_id");
    const author = url.searchParams.get("author_id");
    const q = fold(url.searchParams.get("q") ?? "");
    const found = published(locale, "post")
      .filter((e) => !term || e.terms.some((t) => t.id === term))
      .filter((e) => !author || e.authors.some((a) => a.id === author))
      .filter((e) => !q || fold(e.title).includes(q));
    send(response, 200, pageOf(found, url) satisfies Schemas["Page_PublicEntryResponse"]);
    return true;
  }
  if (route === "GET /api/v1/content/public/feed") {
    const locale = url.searchParams.get("locale") ?? "vi";
    send(response, 200, {
      data: published(locale, "post").slice(0, Number(url.searchParams.get("limit") ?? 20)),
    } satisfies Schemas["Data_Vec_PublicEntryResponse"]);
    return true;
  }
  if (route === "GET /api/v1/content/public/resolve") {
    const locale = url.searchParams.get("locale") ?? "vi";
    const at = url.searchParams.get("path") ?? "";
    if (at === "/blog/bai-cu" && locale === "vi") {
      send(response, 200, {
        data: { type: "redirect", status: 308, location: "/blog/chao-gang-chao-inox" },
      } satisfies Schemas["Data_Resolution"]);
      return true;
    }
    if (at === "/blog/da-go") {
      send(response, 200, { data: { type: "gone" } } satisfies Schemas["Data_Resolution"]);
      return true;
    }
    const found = entries.find((e) => e.locale === locale && e.path === at);
    if (!found) {
      problem(response, 404, "content.not_found", `Nothing is published at \`${at}\`.`);
      return true;
    }
    send(response, 200, {
      data: { type: "entry", entry: found },
    } satisfies Schemas["Data_Resolution"]);
    return true;
  }
  const term = path.match(/^\/api\/v1\/content\/public\/terms\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && term) {
    const found = TERMS.find(
      (t) => t.taxonomy === term[1] && t.slug === decodeURIComponent(term[2] ?? ""),
    );
    if (!found) {
      problem(response, 404, "content.term_not_found", "No such category or tag.");
      return true;
    }
    send(response, 200, {
      data: {
        ...found,
        parent_id: null,
        meta_title: "",
        meta_description: "",
        translations: [{ locale: "vi", path: found.slug }],
      },
    } satisfies Schemas["Data_PublicTermPage"]);
    return true;
  }
  const author = path.match(/^\/api\/v1\/content\/public\/authors\/([^/]+)$/);
  if (request.method === "GET" && author) {
    const found = AUTHORS.find((a) => a.slug === decodeURIComponent(author[1] ?? ""));
    if (!found) {
      problem(response, 404, "content.author_not_found", "No such author.");
      return true;
    }
    send(response, 200, {
      data: {
        id: found.id,
        display_name: found.display_name,
        slug: found.slug,
        bio: "Biên tập viên.",
        website_url: "",
        avatar: null,
      },
    } satisfies Schemas["Data_PublicAuthorPage"]);
    return true;
  }
  if (route === "POST /__storefront/search") {
    semanticSearch = (await json(request)).enabled === true;
    send(response, 204);
    return true;
  }
  if (route === "GET /api/v1/content/public/search" && !semanticSearch) {
    problem(
      response,
      404,
      "content.semantic_search_disabled",
      "Search by meaning is not offered to the public on this server. Use `GET /api/v1/content/public/posts?q=`.",
    );
    return true;
  }
  if (route === "GET /api/v1/content/public/search") {
    const q = fold(url.searchParams.get("q") ?? "");
    const locale = url.searchParams.get("locale") ?? "vi";
    const hits = published(locale)
      .filter((e) => q && fold(`${e.title} ${e.excerpt}`).includes(q))
      .map((e, i) => ({
        entry_id: e.id,
        kind: e.kind,
        locale: e.locale,
        title: e.title,
        path: e.path,
        score: 1 / (i + 1),
        similarity: null,
        snippet: e.excerpt,
        matched_by: ["text" as const],
        status: null,
      }));
    send(response, 200, {
      data: hits,
      pagination: { limit: 10, next_cursor: null },
    } satisfies Schemas["Page_SearchHit"]);
    return true;
  }
  if (route === "GET /api/v1/content/public/sitemap") {
    const items = entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      locale: e.locale,
      path: e.path,
      content_modified_at: e.content_modified_at,
      noindex: e.seo.noindex,
      translations: e.translations,
    }));
    send(response, 200, pageOf(items, url) satisfies Schemas["Page_SitemapItem"]);
    return true;
  }

  // ------------------------------------------------------------ comments
  const target = path.match(/^\/api\/v1\/comments\/public\/targets\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && target) {
    const shown = comments.filter((c) => c.target_id === target[2]);
    send(response, 200, {
      data: {
        target_type: target[1] ?? "",
        target_id: target[2] ?? "",
        state: "open",
        hidden: false,
        closes_at: null,
        comment_count: shown.length,
        thread_count: shown.filter((c) => !c.parent_id).length,
        pending_count: null,
        pending_thread_count: null,
      },
    } satisfies Schemas["Data_CommentTarget"]);
    return true;
  }
  if (route === "GET /api/v1/comments/public/threads") {
    const id = url.searchParams.get("target_id");
    const roots = comments.filter((c) => c.target_id === id && !c.parent_id).map(threadOf);
    send(response, 200, pageOf(roots, url, 50) satisfies Schemas["Page_ThreadComment"]);
    return true;
  }
  if (route === "POST /api/v1/comments/public/comments") {
    const body = await json(request);
    const errors: Schemas["ProblemField"][] = [];
    if (!text(body, "body").trim())
      errors.push({ field: "body", code: "required", detail: "must not be empty" });
    if (!text(body, "author_name").trim())
      errors.push({ field: "author_name", code: "required", detail: "guests must give a name" });
    if (!text(body, "form_token"))
      errors.push({
        field: "form_token",
        code: "required",
        detail: "ask /api/v1/antispam/token first",
      });
    if (errors.length > 0) {
      problem(
        response,
        422,
        "validation_failed",
        "The request contains invalid values. See `errors` for each field.",
        errors,
      );
      return true;
    }
    const id = randomUUID();
    const parent = typeof body.parent_id === "string" ? body.parent_id : null;
    const value = text(body, "body");
    const comment: Comment = {
      id,
      target_type: text(body, "target_type"),
      target_id: text(body, "target_id"),
      root_id: parent ?? id,
      parent_id: parent,
      reply_to_id: parent,
      author: { kind: "guest", name: text(body, "author_name") },
      badges: [],
      body: value,
      body_html: value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      format: "text",
      deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_count: 0,
    };
    // Như core: bình luận có link chờ duyệt, còn lại hiện ngay.
    const pending = /https?:\/\//.test(value);
    if (!pending) comments.push(comment);
    send(response, 201, {
      data: {
        ...comment,
        status: pending ? "pending" : "published",
        edit_token: randomUUID(),
        editable_until: null,
      },
    } satisfies Schemas["Data_PostedComment"]);
    return true;
  }
  if (
    route === "POST /api/v1/comments/public/verify" ||
    route === "POST /api/v1/comments/public/unsubscribe"
  ) {
    const body = await json(request);
    if (text(body, "token") !== "ok-token") {
      problem(response, 400, "comments.invalid_token", "The link is not valid any more.");
      return true;
    }
    if (route.endsWith("verify")) {
      send(response, 200, { data: { verified: true } } satisfies Schemas["Data_VerifiedResponse"]);
    } else {
      send(response, 200, {
        data: { unsubscribed: true },
      } satisfies Schemas["Data_CommentsUnsubscribed"]);
    }
    return true;
  }

  // ------------------------------------------------------------ newsletter
  if (route === "GET /api/v1/newsletter/public/lists") {
    const locale = url.searchParams.get("locale") === "en" ? "en" : "vi";
    send(response, 200, {
      data: {
        token_scope: "newsletter:subscribe",
        locale,
        lists: [
          {
            key: "weekly",
            name: locale === "en" ? "Weekly newsletter" : "Bản tin hằng tuần",
            description: "",
            double_opt_in: true,
          },
        ],
      },
    } satisfies Schemas["Data_PublicListsResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/public/subscribe") {
    const body = await json(request);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(body, "email"))) {
      problem(
        response,
        422,
        "validation_failed",
        "The request contains invalid values. See `errors` for each field.",
        [{ field: "email", code: "email", detail: "must be an email address" }],
      );
      return true;
    }
    send(response, 202, { data: { accepted: true } } satisfies Schemas["Data_SubscribeResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/public/confirm") {
    const body = await json(request);
    if (text(body, "token") !== "ok-token") {
      problem(response, 400, "newsletter.invalid_token", "The link is not valid any more.");
      return true;
    }
    confirmed.add("weekly");
    send(response, 200, {
      data: {
        lists: [{ key: "weekly", name: { vi: "Bản tin hằng tuần", en: "Weekly newsletter" } }],
      },
    } satisfies Schemas["Data_ConfirmResponse"]);
    return true;
  }
  if (path === "/api/v1/newsletter/public/preferences") {
    if (url.searchParams.get("token") !== "ok-token") {
      problem(response, 404, "newsletter.subscriber_not_found", "The link is not valid any more.");
      return true;
    }
    if (request.method === "PUT") {
      const body = await json(request);
      if (body.unsubscribe_all === true) confirmed.clear();
      for (const choice of (body.lists as { key: string; subscribed: boolean }[] | undefined) ??
        []) {
        if (choice.subscribed) confirmed.add(choice.key);
        else confirmed.delete(choice.key);
      }
    }
    send(response, 200, {
      data: {
        email: "ban@example.com",
        locale: "vi",
        name: null,
        lists: [
          {
            key: "weekly",
            name: { vi: "Bản tin hằng tuần", en: "Weekly newsletter" },
            description: { vi: "Bài mới mỗi tuần.", en: "New articles every week." },
            subscribed: confirmed.has("weekly"),
            status: confirmed.has("weekly") ? "confirmed" : "unsubscribed",
          },
        ],
      },
    } satisfies Schemas["Data_PreferencesResponse"]);
    return true;
  }
  return false;
}
