"use server";

// Server Action của màn Menu (dữ liệu mẫu, W-006: module `menus` chưa có trong core). Gọi hàm mẫu
// của `src/sample/menus.ts` thay cho API của module `menus`; trả lỗi cùng hình dạng Problem như
// phần gọi core thật. Riêng "nhập menu cũ" đọc menu cũ THẬT của `content` (chỉ đọc).
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { loadLegacyMenus } from "@/lib/legacy-menus";
import type { MenuItemInput } from "@/lib/menu-tree";
import { sampleGuard, translateSample } from "@/lib/sample-action";
import { getMe } from "@/lib/viewer";
import {
  createMenu,
  deleteMenu,
  type ImportRow,
  importLegacy,
  type Menu,
  putMenu,
  simulateOtherSave,
} from "@/sample/menus";

type Result<T> = { ok: true; data: T } | { ok: false; problem: Problem };

async function off(): Promise<{ ok: false; problem: Problem } | null> {
  const guard = await sampleGuard();
  if (!guard) return null;
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "sample_data_off",
      detail: guard.error ?? "",
    },
  };
}

async function who(): Promise<string> {
  const me = await getMe();
  return me.email.split("@")[0] ?? me.email;
}

const id = z.string().min(1).max(64);

const Item: z.ZodType<MenuItemInput> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    label: z.string().max(200),
    url: z.string().max(2000).nullable(),
    ref_kind: z.string().max(64).nullable(),
    ref_id: z.string().max(64).nullable(),
    auto_children: z.boolean(),
    auto_children_limit: z.number().int(),
    icon: z
      .enum([
        "grid",
        "pan",
        "pot",
        "knife",
        "glass",
        "bowl",
        "towel",
        "tag",
        "store",
        "book",
        "gift",
        "pin",
      ])
      .nullable(),
    badge_text: z.string().max(40),
    badge_tone: z.enum(["sale", "brand", "new", "neutral"]),
    badge_from: z.iso.date().nullable(),
    badge_until: z.iso.date().nullable(),
    highlight: z.enum(["none", "sale", "brand"]),
    feature_kind: z.string().max(64).nullable(),
    feature_id: z.string().max(64).nullable(),
    children: z.array(Item).max(200),
  }),
);

/** Lưu cả cây (`If-Match`): người khác vừa lưu thì 412; lỗi dữ liệu gom một lần (422). */
export async function saveMenu(
  menuId: string,
  ifMatch: string,
  items: MenuItemInput[],
): Promise<Result<{ menu: Menu; etag: string }>> {
  const stop = await off();
  if (stop) return stop;
  const parsed = z.array(Item).max(200).safeParse(items);
  if (!id.safeParse(menuId).success || !parsed.success) {
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
  const result = await putMenu(menuId, ifMatch.slice(0, 40), parsed.data, await who());
  if (!result.ok) return { ok: false, problem: await translateSample(result.problem) };
  refresh();
  return result;
}

/** "Menu mới": khoá, ngôn ngữ, chép từ một menu có sẵn (tuỳ chọn). */
export async function newMenu(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await sampleGuard();
  if (stop) return stop;
  const values = {
    key: String(formData.get("key") ?? "").trim(),
    locale: String(formData.get("locale") ?? ""),
    copy_from: String(formData.get("copy_from") ?? ""),
  };
  const t = await getTranslations("menus.create");
  if (!values.key) return { fields: { key: t("keyRequired") }, values };
  const result = await createMenu({
    website_id: String(formData.get("website_id") ?? ""),
    key: values.key,
    locale: values.locale,
    copy_from: values.copy_from || undefined,
    by: await who(),
  });
  if (!result.ok) {
    return { ...problemState(await translateSample(result.problem), ["key", "locale"]), values };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Xoá một menu (hộp thoại xác nhận). */
export async function removeMenu(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await sampleGuard();
  if (stop) return stop;
  const result = await deleteMenu(String(formData.get("id") ?? ""));
  if (!result.ok) return problemState(await translateSample(result.problem), []);
  refresh();
  return { done: nextDone(state) };
}

/** Chỉ có ở dữ liệu mẫu: giả một người khác vừa lưu menu, để thử 412. */
export async function otherPersonSaves(menuId: string): Promise<Result<{ version: number }>> {
  const stop = await off();
  if (stop) return stop;
  return simulateOtherSave(menuId);
}

/**
 * Nhập menu cũ của `content` (đọc THẬT qua `GET /api/v1/content/menus…`) vào website đang chọn.
 * `dryRun`: chỉ báo sẽ tạo, giữ hay bỏ qua menu nào.
 */
export async function importOldMenus(
  websiteId: string,
  dryRun: boolean,
): Promise<Result<ImportRow[]>> {
  const stop = await off();
  if (stop) return stop;
  const legacy = await loadLegacyMenus();
  if (legacy === null) {
    const t = await getTranslations("structure.menus");
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        code: "permission_denied",
        detail: t("unavailable"),
      },
    };
  }
  const result = await importLegacy(legacy, websiteId, dryRun, await who());
  if (!dryRun) refresh();
  return { ok: true, data: result.data };
}
