"use server";

// Server Action của màn Menu, gọi module `menus` THẬT của core (D-238). Mọi lời gọi chạy ở máy chủ
// với token lấy từ cookie `httpOnly`; trình duyệt chỉ nhận menu và `ETag` của nó. SDK tự gắn
// `Idempotency-Key` cho mỗi lệnh ghi.
//
// Lưu là thay cả cây (`PUT`, `If-Match` bắt buộc): người khác vừa lưu thì core trả 412 và không ghi
// gì; lỗi dữ liệu core gom một lần (422, `errors[]` theo vị trí `items[0].children[1]…`).
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import {
  BADGE_TONES,
  HIGHLIGHTS,
  MAX_AUTO_CHILDREN,
  MAX_BADGE,
  MAX_ITEMS,
  MAX_LABEL,
  MENU_ICONS,
  type MenuItemDraft,
} from "@/lib/menu-tree";
import { fromSaved, type SiteMenu, toInput } from "@/lib/menus";

type Result<T> = { ok: true; data: T } | { ok: false; problem: Problem };

/** Trạng thái form "Menu mới": kèm id của menu vừa tạo để mở nó ngay. */
export interface NewMenuState extends FormState {
  menuId?: string;
}

const id = z.uuid();
const etag = z.string().min(1).max(200);
const Ref = z.object({ kind: z.string().min(1).max(64), id: z.string().min(1).max(64) });

// Chỉ kiểm hình dạng (người gọi Server Action bằng tay); kiểm nội dung là việc của core.
const Item: z.ZodType<MenuItemDraft> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    label: z.string().max(MAX_LABEL * 4),
    url: z.string().max(4096).nullable(),
    ref: Ref.nullable(),
    auto_children: z.boolean(),
    auto_children_limit: z
      .number()
      .int()
      .min(0)
      .max(MAX_AUTO_CHILDREN * 10),
    icon: z.enum(MENU_ICONS).nullable(),
    highlight: z.enum(HIGHLIGHTS).nullable(),
    badge: z
      .object({
        text: z.string().max(MAX_BADGE * 4),
        tone: z.enum(BADGE_TONES),
        from: z.iso.datetime({ offset: true }).nullable(),
        until: z.iso.datetime({ offset: true }).nullable(),
      })
      .nullable(),
    feature: Ref.nullable(),
    children: z.array(Item).max(MAX_ITEMS),
  }),
);

function invalid(): { ok: false; problem: Problem } {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "invalid_request",
      detail: "The request is not valid.",
    },
  };
}

/**
 * Lưu cả cây của menu `menuId` với `If-Match: ifMatch` (`PUT /api/v1/menus/{id}`). Trả menu như
 * core đã lưu và `ETag` mới.
 */
export async function saveMenu(
  menuId: string,
  ifMatch: string,
  items: MenuItemDraft[],
): Promise<Result<{ menu: SiteMenu; etag: string }>> {
  const parsed = z.array(Item).max(MAX_ITEMS).safeParse(items);
  if (!id.safeParse(menuId).success || !etag.safeParse(ifMatch).success || !parsed.success) {
    return invalid();
  }
  let version = "";
  const result = await send(async (client) => {
    const answer = await client.PUT("/api/v1/menus/{id}", {
      params: { path: { id: menuId }, header: { "If-Match": ifMatch } },
      body: { items: toInput(parsed.data) },
    });
    version = answer.response.headers.get("etag") ?? "";
    return answer;
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: { menu: result.data.data, etag: version } };
}

/** "Menu mới": khoá, ngôn ngữ, chép cây từ một menu có sẵn (tuỳ chọn). */
export async function newMenu(state: NewMenuState, formData: FormData): Promise<NewMenuState> {
  const values = {
    key: String(formData.get("key") ?? "").trim(),
    locale: String(formData.get("locale") ?? ""),
    copy_from: String(formData.get("copy_from") ?? ""),
  };
  const t = await getTranslations("menus.create");
  if (!values.key) return { fields: { key: t("keyRequired") }, values };
  // Ngôn ngữ nào được phép là việc của core (`AUTOXIDE_MENUS_LOCALES`, lỗi `locale_not_supported`).
  if (values.locale.length > 35) return badRequest(values);
  let items: ReturnType<typeof toInput> = [];
  if (values.copy_from) {
    if (!id.safeParse(values.copy_from).success) return badRequest(values);
    const source = await send((client) =>
      client.GET("/api/v1/menus/{id}", { params: { path: { id: values.copy_from } } }),
    );
    if (!source.ok) return { ...problemState(source.problem, []), values };
    // Chép đích và cách trình bày, không chép id (`POST` không nhận): core cấp id mới.
    items = toInput(fromSaved(source.data.data.items), { keepIds: false });
  }
  const result = await send((client) =>
    client.POST("/api/v1/menus", {
      body: { key: values.key, locale: values.locale, items },
    }),
  );
  if (!result.ok) {
    // Trùng khoá và ngôn ngữ: 409 `menus.menu_exists`, báo dưới ô khoá.
    return {
      ...problemState(result.problem, ["key", "locale"], { "menus.menu_exists": "key" }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), menuId: result.data.data.id };
}

function badRequest(values: Record<string, string>): NewMenuState {
  return { error: invalid().problem.detail, code: "invalid_request", values };
}

/** Xoá một menu (hộp thoại xác nhận): `DELETE /api/v1/menus/{id}`. */
export async function removeMenu(state: FormState, formData: FormData): Promise<FormState> {
  const menuId = String(formData.get("id") ?? "");
  if (!id.safeParse(menuId).success) return { error: invalid().problem.detail };
  const result = await send((client) =>
    client.DELETE("/api/v1/menus/{id}", { params: { path: { id: menuId } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
