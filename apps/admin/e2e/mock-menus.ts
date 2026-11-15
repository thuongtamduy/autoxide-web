// Module `menus` (menu của website, D-238 của core) cho core giả. Hình dạng theo `openapi.json`
// (`satisfies` kiểu của SDK); kiểm dữ liệu và mã lỗi như `items.rs` / `service.rs` của core: lỗi gom
// một lần (422, `errors[]` theo vị trí `items[0].children[1]…`), mọi lỗi cùng một loại đích thì mã
// riêng (`menus.ref_unknown_kind`, `menus.ref_not_found`, `menus.children_unsupported`). Loại đối
// tượng core giả biết: `content.entry`, `content.term` (đọc từ `mock-content.ts`).
//
// `PUT` bắt buộc `If-Match` (428 / 412); `POST` trả 201 + `Location`, không có `ETag` (như core);
// cấp id mới cho mọi mục mỗi lần lưu (như core). `POST /__menus/bump` (`{"id"}`) lưu menu như có
// người khác vừa lưu, để thử 412.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModuleInfo } from "@autoxide/sdk";
import { contentResource, contentTermChildren } from "./mock-content.ts";
import { empty, json, problem, type Schemas, send } from "./mock-http.ts";

type Item = Schemas["SiteMenuItem"];
type Input = Schemas["SiteMenuItemInput"];
type FieldError = Schemas["ProblemField"];
type Menu = Schemas["SiteMenu"] & { version: number };

export const MENUS_MODULE: ModuleInfo = {
  name: "menus",
  internal: false,
  position: 9,
  permissions: [
    { name: "menus.read", description: "Read website menus.", risk: "read" },
    {
      name: "menus.manage",
      description: "Create, change and delete website menus.",
      risk: "write",
    },
  ],
  events: [],
  subscriptions: [],
  jobs: [],
  schedules: [],
  tools: [],
  deprecations: [],
  languages: ["vi"],
  migrations: [{ name: "m0001_create_menus", applied: true }],
};

const LOCALES = ["en", "vi"];
const DEFAULT_LOCALE = "en";
const KINDS: Record<string, { tree: boolean }> = {
  "content.entry": { tree: false },
  "content.term": { tree: true },
};
const ICONS = [
  "bag",
  "bolt",
  "book",
  "calendar",
  "cart",
  "category",
  "chat",
  "fire",
  "gift",
  "grid",
  "heart",
  "help",
  "home",
  "info",
  "mail",
  "map_pin",
  "news",
  "percent",
  "phone",
  "search",
  "shop",
  "sparkles",
  "star",
  "store",
  "tag",
  "truck",
  "user",
];
const HIGHLIGHTS = ["accent", "brand", "sale", "muted"];
const TONES = ["sale", "brand", "new", "neutral"];
/** Danh mục "Chọn mua" của `mock-content.ts`. */
const TERM = "01a1dd85-f5c7-77d6-b517-807884ba3e01";

let menus: Menu[] = [];
let clock = Date.parse("2026-11-15T02:00:00Z");

function now(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

function item(fields: Partial<Item> & { label: string }): Item {
  return {
    id: randomUUID(),
    url: null,
    ref: null,
    auto_children: false,
    auto_children_limit: null,
    icon: null,
    highlight: null,
    badge: null,
    feature: null,
    children: [],
    ...fields,
  };
}

export function resetMenus() {
  clock = Date.parse("2026-11-15T02:00:00Z");
  const at = now();
  menus = [
    {
      id: "01a1e200-0000-7000-8000-0000000000a1",
      key: "main",
      locale: "vi",
      created_at: at,
      updated_at: at,
      version: 1,
      items: [
        item({ label: "", ref: { kind: "content.term", id: TERM }, icon: "grid" }),
        item({
          label: "Khuyến mại",
          url: "/khuyen-mai",
          icon: "percent",
          highlight: "sale",
          badge: { text: "−10%", tone: "sale", from: "2026-01-01T00:00:00Z", until: null },
        }),
        item({
          label: "Hỗ trợ",
          children: [
            item({ label: "Tra cứu đơn hàng", url: "/tra-cuu-don-hang" }),
            item({ label: "Gửi thư", url: "mailto:hotro@example.com" }),
          ],
        }),
      ],
    },
    {
      id: "01a1e200-0000-7000-8000-0000000000a2",
      key: "footer",
      locale: "vi",
      created_at: at,
      updated_at: at,
      version: 1,
      items: [item({ label: "Về chúng tôi", url: "/ve-chung-toi" })],
    },
  ];
}
resetMenus();

function view({ version: _version, ...menu }: Menu): Schemas["SiteMenu"] {
  return menu;
}

function summary(menu: Menu): Schemas["SiteMenuSummary"] {
  const { id, key, locale, created_at, updated_at } = menu;
  return { id, key, locale, created_at, updated_at };
}

function etag(menu: Menu): string {
  return `"${menu.version}"`;
}

function sendMenu(response: ServerResponse, status: number, menu: Menu) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...(status === 201 ? { Location: `/api/v1/menus/${menu.id}` } : { ETag: etag(menu) }),
  });
  response.end(JSON.stringify({ data: view(menu) } satisfies Schemas["Data_SiteMenu"]));
}

function isLink(url: string): boolean {
  const lower = url.toLowerCase();
  const scheme =
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    (url.startsWith("/") && !url.startsWith("//"));
  // biome-ignore lint/suspicious/noControlCharactersInRegex: chặn ký tự điều khiển như core.
  return scheme && url.length <= 2048 && !/[\s\\\u0000-\u001f\u007f]/.test(url);
}

const goodKind = (kind: string) => /^[a-z0-9_]+\.[a-z0-9_]+$/.test(kind) && kind.length <= 64;

/** Kiểm cả cây như core, gom mọi lỗi; trả cây đã lưu (id mới cho mọi mục). */
function check(items: Input[], locale: string, problems: FieldError[]): Item[] {
  let count = 0;
  const targets: { path: string; kind: string; id: string; auto: boolean }[] = [];
  const walk = (list: Input[], depth: number, path: string): Item[] =>
    list.flatMap((input, index) => {
      const here = `${path}[${index}]`;
      if (depth > 4) {
        problems.push({ field: here, code: "too_deep", detail: "menus nest at most 4 levels" });
        return [];
      }
      count += 1;
      const label = (input.label ?? "").trim();
      const url = (input.url ?? "").trim() || null;
      const ref = input.ref ?? null;
      if (url && ref) {
        problems.push({
          field: `${here}.url`,
          code: "invalid",
          detail: "give at most one of `url` and `ref`",
        });
      }
      if (label.length > 200 || (!label && !ref)) {
        problems.push({
          field: `${here}.label`,
          code: "length",
          detail: "must be 1 to 200 characters (it may be empty when `ref` is given)",
        });
      }
      if (url && !isLink(url)) {
        problems.push({
          field: `${here}.url`,
          code: "invalid",
          detail: "must be `https://`, `http://`, `mailto:` or a path starting with a single `/`",
        });
      }
      for (const [name, target] of [
        ["ref", ref],
        ["feature", input.feature ?? null],
      ] as const) {
        if (!target) continue;
        if (!goodKind(target.kind)) {
          problems.push({
            field: `${here}.${name}.kind`,
            code: "invalid",
            detail: "must be a resource type like `content.term`",
          });
        } else {
          targets.push({
            path: `${here}.${name}`,
            kind: target.kind,
            id: target.id.trim(),
            auto: name === "ref" && input.auto_children === true,
          });
        }
      }
      let limit: number | null = null;
      if (input.auto_children) {
        if (!ref) {
          problems.push({
            field: `${here}.auto_children`,
            code: "invalid",
            detail: "needs `ref`: sub-items are taken from the object it points to",
          });
        }
        limit = input.auto_children_limit ?? 12;
        if (limit < 1 || limit > 50) {
          problems.push({
            field: `${here}.auto_children_limit`,
            code: "range",
            detail: "must be 1 to 50",
          });
        }
      } else if (input.auto_children_limit != null) {
        problems.push({
          field: `${here}.auto_children_limit`,
          code: "invalid",
          detail: "only with `auto_children: true`",
        });
      }
      if (input.icon && !ICONS.includes(input.icon)) {
        problems.push({
          field: `${here}.icon`,
          code: "invalid",
          detail: `must be one of: ${ICONS.join(", ")}`,
        });
      }
      if (input.highlight && !HIGHLIGHTS.includes(input.highlight)) {
        problems.push({
          field: `${here}.highlight`,
          code: "invalid",
          detail: `must be one of: ${HIGHLIGHTS.join(", ")}`,
        });
      }
      const badge = input.badge ?? null;
      if (badge) {
        const text = badge.text.trim().length;
        if (text === 0 || text > 20) {
          problems.push({
            field: `${here}.badge.text`,
            code: "length",
            detail: "must be 1 to 20 characters",
          });
        }
        if (!TONES.includes(badge.tone)) {
          problems.push({
            field: `${here}.badge.tone`,
            code: "invalid",
            detail: `must be one of: ${TONES.join(", ")}`,
          });
        }
      }
      return [
        {
          id: randomUUID(),
          label,
          url,
          ref: ref ? { kind: ref.kind, id: ref.id.trim() } : null,
          auto_children: input.auto_children === true,
          auto_children_limit: limit,
          icon: input.icon ?? null,
          highlight: input.highlight ?? null,
          badge: badge
            ? {
                text: badge.text.trim(),
                tone: badge.tone,
                from: badge.from ?? null,
                until: badge.until ?? null,
              }
            : null,
          feature: input.feature ? { kind: input.feature.kind, id: input.feature.id.trim() } : null,
          children: walk(input.children ?? [], depth + 1, `${here}.children`),
        },
      ];
    });
  const tree = walk(items, 1, "items");
  if (count > 200) problems.push({ field: "items", code: "length", detail: "at most 200 items" });
  // Đích: loại đã đăng ký, đối tượng có thật, nhóm con tự lấy chỉ trên loại có cây.
  for (const target of targets) {
    const kind = KINDS[target.kind];
    if (!kind) {
      problems.push({
        field: `${target.path}.kind`,
        code: "ref_unknown_kind",
        detail: `no module provides \`${target.kind}\`; known: ${Object.keys(KINDS).join(", ")}`,
      });
      continue;
    }
    if (target.auto && !kind.tree) {
      problems.push({
        field: target.path.replace(/\.ref$/, ".auto_children"),
        code: "children_unsupported",
        detail: `\`${target.kind}\` has no sub-items to take`,
      });
    }
    if (!contentResource(target.kind, target.id, locale)) {
      problems.push({
        field: `${target.path}.id`,
        code: "ref_not_found",
        detail: `no \`${target.kind}\` has this id`,
      });
    }
  }
  return tree;
}

/** Như `invalid` của service: mọi lỗi cùng một loại đích thì mã riêng của loại đó. */
function invalid(response: ServerResponse, problems: FieldError[]) {
  for (const code of ["ref_unknown_kind", "ref_not_found", "children_unsupported"]) {
    if (problems.every((p) => p.code === code)) {
      return problem(
        response,
        422,
        `menus.${code}`,
        `Every problem is ${code}; see \`errors\`.`,
        problems,
      );
    }
  }
  return problem(
    response,
    422,
    "validation_failed",
    "The request contains invalid values. See `errors` for each field.",
    problems,
  );
}

function badgeOn(badge: Item["badge"], at: number): boolean {
  if (!badge) return false;
  if (badge.from && Date.parse(badge.from) > at) return false;
  if (badge.until && Date.parse(badge.until) <= at) return false;
  return true;
}

/** Cây đã giải cho website, theo luật của menu công khai (D-238). */
function resolve(items: Item[], locale: string): Schemas["PublicSiteMenuItem"][] {
  const at = Date.now();
  return items.flatMap((entry) => {
    const target = entry.ref ? contentResource(entry.ref.kind, entry.ref.id, locale) : null;
    if (entry.ref && !target?.public) return [];
    const children = resolve(entry.children, locale);
    if (entry.auto_children && entry.ref?.kind === "content.term") {
      for (const id of contentTermChildren(entry.ref.id).slice(
        0,
        entry.auto_children_limit ?? 12,
      )) {
        const child = contentResource("content.term", id, locale);
        if (child) {
          children.push({
            label: child.title,
            href: child.path,
            ref: { kind: "content.term", id },
            icon: null,
            highlight: null,
            badge: null,
            feature: null,
            children: [],
          });
        }
      }
    }
    if (!entry.url && !entry.ref && children.length === 0) return [];
    const feature = entry.feature
      ? contentResource(entry.feature.kind, entry.feature.id, locale)
      : null;
    return [
      {
        label: entry.label || target?.title || "",
        href: entry.url ?? target?.path ?? null,
        ref: entry.ref ?? null,
        icon: entry.icon ?? null,
        highlight: entry.highlight ?? null,
        badge:
          entry.badge && badgeOn(entry.badge, at)
            ? { text: entry.badge.text, tone: entry.badge.tone }
            : null,
        feature:
          entry.feature && feature?.public
            ? {
                ref: entry.feature,
                title: feature.title,
                summary: feature.summary,
                href: feature.path,
                image: null,
              }
            : null,
        children,
      },
    ];
  });
}

/** Menu công khai (không cần đăng nhập): `GET /api/v1/menus/public/{key}?locale`. */
export function publicMenu(response: ServerResponse, url: URL): boolean {
  const match = url.pathname.match(/^\/api\/v1\/menus\/public\/([^/]+)$/);
  if (!match) return false;
  const key = decodeURIComponent(match[1] ?? "");
  const asked = url.searchParams.get("locale") ?? DEFAULT_LOCALE;
  if (!LOCALES.includes(asked)) {
    problem(response, 422, "validation_failed", "The request contains invalid values.", [
      {
        field: "locale",
        code: "locale_not_supported",
        detail: `must be one of: ${LOCALES.join(", ")}`,
      },
    ]);
    return true;
  }
  const found =
    menus.find((m) => m.key === key && m.locale === asked) ??
    menus.find((m) => m.key === key && m.locale === DEFAULT_LOCALE);
  if (!found) {
    problem(
      response,
      404,
      "menus.public_menu_not_found",
      `There is no menu \`${key}\` in \`${asked}\`.`,
    );
    return true;
  }
  response.writeHead(200, {
    "Content-Type": "application/json",
    ETag: `"public-${found.version}"`,
    "Cache-Control": "public, max-age=60",
  });
  response.end(
    JSON.stringify({
      data: { key: found.key, locale: found.locale, items: resolve(found.items, found.locale) },
    } satisfies Schemas["Data_PublicSiteMenu"]),
  );
  return true;
}

/** `POST /__menus/bump` (`{"id"}`): người khác vừa lưu menu này (phiên bản mới, thêm một mục). */
export async function bumpMenu(request: IncomingMessage, response: ServerResponse) {
  const body = await json(request);
  const menu = menus.find((m) => m.id === body.id);
  if (!menu) return problem(response, 404, "menus.menu_not_found", "No such menu.");
  menu.items = [...menu.items, item({ label: "Người khác thêm", url: "/nguoi-khac" })];
  menu.version += 1;
  menu.updated_at = now();
  return empty(response, 204);
}

/** `/api/v1/menus…` cho người đã đăng nhập (mọi tài khoản của core giả có đủ permission). */
export async function menusRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<void> {
  if (route === "GET /api/v1/menus") {
    const order = url.searchParams.get("order") === "asc" ? 1 : -1;
    const sorted = [...menus].sort((a, b) => order * a.id.localeCompare(b.id));
    return send(response, 200, {
      data: sorted.map(summary),
      pagination: { limit: Number(url.searchParams.get("limit") ?? 50), next_cursor: null },
    } satisfies Schemas["Page_SiteMenuSummary"]);
  }
  if (route === "POST /api/v1/menus") {
    const body = (await json(request)) as Schemas["CreateSiteMenuRequest"];
    const problems: FieldError[] = [];
    const locale = body.locale ?? DEFAULT_LOCALE;
    if (!LOCALES.includes(locale)) {
      problems.push({
        field: "locale",
        code: "locale_not_supported",
        detail: `must be one of: ${LOCALES.join(", ")}`,
      });
    }
    const key = body.key.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(key)) {
      problems.push({
        field: "key",
        code: "invalid",
        detail: "must be 1 to 64 lower-case letters, digits, `-` or `_`",
      });
    }
    const items = check(body.items ?? [], locale, problems);
    if (problems.length > 0) return invalid(response, problems);
    if (menus.some((m) => m.key === key && m.locale === locale)) {
      return problem(
        response,
        409,
        "menus.menu_exists",
        `A menu \`${key}\` in \`${locale}\` already exists; replace its items instead of creating it again.`,
      );
    }
    const at = now();
    // UUIDv7 sắp theo thời gian: menu mới đứng cuối khi sắp tăng dần theo id.
    const id = `01a1e200-${(clock / 1000).toString(16).slice(-4)}-7000-8000-${randomUUID().slice(-12)}`;
    const menu: Menu = { id, key, locale, created_at: at, updated_at: at, version: 1, items };
    menus.push(menu);
    return sendMenu(response, 201, menu);
  }
  const match = url.pathname.match(/^\/api\/v1\/menus\/([^/]+)$/);
  const menu = match ? menus.find((m) => m.id === match[1]) : undefined;
  if (match && !menu) {
    return problem(response, 404, "menus.menu_not_found", `There is no menu \`${match[1]}\`.`);
  }
  if (menu && request.method === "GET") return sendMenu(response, 200, menu);
  if (menu && request.method === "PUT") {
    const ifMatch = request.headers["if-match"];
    if (!ifMatch) {
      return problem(
        response,
        428,
        "precondition_required",
        "Send the `ETag` you read in an `If-Match` header.",
      );
    }
    const body = (await json(request)) as Schemas["ReplaceSiteMenuItemsRequest"];
    const problems: FieldError[] = [];
    const items = check(body.items ?? [], menu.locale, problems);
    if (problems.length > 0) return invalid(response, problems);
    if (ifMatch !== "*" && ifMatch !== etag(menu)) {
      return problem(
        response,
        412,
        "precondition_failed",
        "The record changed since you read it (its `ETag` is different).",
      );
    }
    menu.items = items;
    menu.version += 1;
    menu.updated_at = now();
    return sendMenu(response, 200, menu);
  }
  if (menu && request.method === "DELETE") {
    menus = menus.filter((m) => m !== menu);
    return empty(response, 204);
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
}
