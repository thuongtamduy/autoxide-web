import "server-only";

import { ApiError } from "@autoxide/sdk";
import type { Entry, Term } from "./content";
import { optional } from "./content-server";
import { anonymousClient, load, loadTagged } from "./core";
import type { LegacyMenu, PublicSiteMenu, RefObject, SiteMenu, SiteMenuSummary } from "./menus";
import { currentUnit, rootUnit } from "./org-server";
import { USERS_READ } from "./permissions";
import { termName, termSlug } from "./structure";
import { can } from "./viewer";

// Đọc dữ liệu của màn Menu (module `menus`) cho Server Component.

/** Số trang tối đa khi đọc hết danh sách menu (mỗi trang 200): một website có ít menu. */
const MAX_PAGES = 5;

/**
 * Mọi menu (mọi ngôn ngữ) của một website, sắp theo khoá rồi ngôn ngữ. Website = nút đang chọn ở
 * góc trên trái, không chọn thì website của cả khách (nút gốc): mỗi website có menu riêng (D-305).
 */
export async function loadMenus(): Promise<SiteMenuSummary[]> {
  const all: SiteMenuSummary[] = [];
  let cursor: string | undefined;
  const site = (await currentUnit()) ?? (await rootUnit());
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await load((client) =>
      client.GET("/api/v1/menus", {
        params: {
          query: {
            limit: 200,
            order: "asc",
            ...(cursor ? { cursor } : {}),
            ...(site ? { owner_org: site.id } : {}),
          },
        },
      }),
    );
    all.push(...answer.data);
    cursor = answer.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all.sort((a, b) => a.key.localeCompare(b.key) || a.locale.localeCompare(b.locale));
}

/** Một menu kèm `ETag` (gửi lại trong `If-Match` khi lưu); `null` khi không còn menu này. */
export async function loadMenu(id: string): Promise<{ menu: SiteMenu; etag: string } | null> {
  try {
    const { data, etag } = await loadTagged((client) =>
      client.GET("/api/v1/menus/{id}", { params: { path: { id } } }),
    );
    return { menu: data.data, etag: etag ?? "" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Menu như website đang hiện (`GET /api/v1/menus/public/{key}`), gọi như khách để thấy đúng thứ
 * người xem thấy. `null` khi core không trả được (404: cả ngôn ngữ mặc định cũng không có menu này).
 */
export async function loadPublicMenu(key: string, locale: string): Promise<PublicSiteMenu | null> {
  try {
    const client = await anonymousClient();
    const { data } = await client.GET("/api/v1/menus/public/{key}", {
      params: { path: { key }, query: { locale } },
    });
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Bài, trang, danh mục, thẻ THẬT để chọn làm đích (200 bài mới sửa nhất, 200 danh mục / thẻ). Core
 * chưa có API tìm trong sổ đối tượng, nên đọc qua API của `content`; thiếu `content.read` thì rỗng.
 */
export async function loadContentTargets(locale: string): Promise<RefObject[]> {
  const [entries, terms] = await Promise.all([
    optional(
      load((client) =>
        client.GET("/api/v1/content/entries", {
          params: { query: { limit: 200, sort: "updated_at" } },
        }),
      ),
    ),
    optional(
      load((client) => client.GET("/api/v1/content/terms", { params: { query: { limit: 200 } } })),
    ),
  ]);
  const termList: Term[] = terms?.data ?? [];
  const entryList: Entry[] = entries?.data ?? [];
  return [
    ...entryList.map((entry) => ({
      kind: "content.entry",
      id: entry.id,
      title: entry.title,
      hint: `${entry.kind} · ${entry.locale} · /${entry.slug}`,
      // Như `content.entry` của sổ đối tượng: chỉ bài có bản công khai mới hiện trên menu.
      public: entry.status === "published",
      children: [],
      sample: false,
    })),
    ...termList.map((term) => ({
      kind: "content.term",
      id: term.id,
      title: termName(term, locale),
      hint: `${term.taxonomy} · ${termSlug(term, locale)}`,
      // Danh mục và thẻ luôn công khai (không có bản nháp).
      public: true,
      children: termList.filter((t) => t.parent_id === term.id).map((t) => termName(t, locale)),
      sample: false,
    })),
  ];
}

/** Menu cũ của `content` và ngày ngừng của API cũ (header `Sunset` core gửi kèm). */
export interface LegacyMenus {
  menus: LegacyMenu[];
  /** Header `Sunset` (RFC 8594) của `GET /api/v1/content/menus`; `null` khi core không gửi. */
  sunset: string | null;
}

/**
 * Mọi menu cũ của `content` (`GET /api/v1/content/menus`, deprecated: menu chuyển sang module
 * `menus`), mỗi menu kèm cây mục. Chỉ đọc, làm nguồn xem trước lệnh nhập. `null` khi không đọc được
 * (thiếu `content.read`, chưa cài `content`).
 */
export async function loadLegacy(): Promise<LegacyMenus | null> {
  let sunset: string | null = null;
  const list = await optional(
    load(async (client) => {
      const answer = await client.GET("/api/v1/content/menus");
      sunset = answer.response.headers.get("sunset");
      return answer;
    }),
  );
  if (!list) return null;
  const menus = await Promise.all(
    list.data.map((summary) =>
      optional(
        load((client) =>
          client.GET("/api/v1/content/menus/{key}", {
            params: { path: { key: summary.key }, query: { locale: summary.locale } },
          }),
        ),
      ),
    ),
  );
  return { menus: menus.flatMap((menu) => (menu ? [menu.data] : [])), sunset };
}

/**
 * Tên của người sửa menu lần cuối (`updated_by` của danh sách). Menu ít và người sửa ít, nên đọc
 * tên bằng `GET /auth/users/{id}` mỗi người một lần, khi người xem có `auth.users.read`; người đang
 * xem thì khỏi đọc. Không đọc được thì không có tên (bảng chỉ hiện giờ sửa).
 */
export async function editorNames(
  ids: readonly (string | null | undefined)[],
  me: { id: string; name: string; email: string },
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.includes(me.id)) names.set(me.id, me.name || me.email);
  const others = unique.filter((id) => id !== me.id).slice(0, 20);
  if (others.length === 0 || !(await can(USERS_READ))) return names;
  await Promise.all(
    others.map(async (id) => {
      try {
        const { data } = await load((client) =>
          client.GET("/api/v1/auth/users/{id}", { params: { path: { id } } }),
        );
        names.set(id, data.name || data.email);
      } catch (error) {
        if (error instanceof ApiError) return;
        throw error;
      }
    }),
  );
  return names;
}
