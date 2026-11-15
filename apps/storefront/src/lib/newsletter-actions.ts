"use server";

import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { ActionState } from "./action-state";
import { formToken } from "./antispam-actions";
import { publicClient, visitorChain } from "./core";
import { isProblem, problemMessage } from "./problem";

// Đăng ký bản tin ở chân trang (`POST /api/v1/newsletter/public/subscribe`). Core luôn trả 202 như
// nhau (không lộ email nào đã có trong danh sách); danh sách cần xác nhận thì người đọc nhận thư.

export interface SubscribeState {
  status: "idle" | "ok" | "error";
  message: string;
}

const locales = routing.locales as readonly string[];

export async function subscribe(_: SubscribeState, form: FormData): Promise<SubscribeState> {
  const raw = String(form.get("locale") ?? "");
  const locale = locales.includes(raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "newsletter" });
  const email = String(form.get("email") ?? "").trim();
  const lists = form.getAll("lists").map(String).filter(Boolean).slice(0, 20);
  if (!email) return { status: "error", message: t("emailRequired") };
  if (lists.length === 0) return { status: "error", message: t("listRequired") };
  const token =
    String(form.get("form_token") ?? "") ||
    (await formToken("newsletter:subscribe", locale)) ||
    null;
  try {
    const { error, response } = await publicClient(locale, await visitorChain()).POST(
      "/api/v1/newsletter/public/subscribe",
      {
        body: {
          email,
          lists,
          locale,
          source: "footer",
          consent_text: String(form.get("consent_text") ?? "").slice(0, 2000) || null,
          form_token: token,
          trap: String(form.get("trap") ?? "") || null,
        },
      },
    );
    if (response.ok) {
      return {
        status: "ok",
        message: form.get("confirm") === "1" ? t("checkInbox", { email }) : t("subscribed"),
      };
    }
    return { status: "error", message: isProblem(error) ? problemMessage(error) : t("failed") };
  } catch {
    return { status: "error", message: t("failed") };
  }
}

export type TokenActionState = ActionState;

function pickLocale(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? "");
  return locales.includes(value) ? value : routing.defaultLocale;
}

/** Xác nhận đăng ký từ link trong thư (`POST /newsletter/public/confirm`). Chỉ chạy khi bấm nút. */
export async function confirmSubscription(
  _: TokenActionState,
  form: FormData,
): Promise<TokenActionState> {
  const locale = pickLocale(form.get("locale"));
  const t = await getTranslations({ locale, namespace: "newsletter.confirm" });
  try {
    const { data } = await publicClient(locale, await visitorChain()).POST(
      "/api/v1/newsletter/public/confirm",
      {
        body: { token: String(form.get("token") ?? "").slice(0, 2000) },
      },
    );
    if (!data) return { status: "error", message: t("invalid") };
    const names = data.data.lists
      .map(
        (list) =>
          (locale === "en" ? list.name.en || list.name.vi : list.name.vi || list.name.en) ?? "",
      )
      .filter(Boolean);
    return {
      status: "ok",
      message: names.length > 0 ? t("done", { lists: names.join(", ") }) : t("doneNone"),
    };
  } catch {
    return { status: "error", message: t("invalid") };
  }
}

/**
 * Lưu tuỳ chọn danh sách (`PUT /newsletter/public/preferences?token=`); `intent=all` huỷ mọi danh
 * sách (trang `/newsletter/unsubscribe` dùng cùng token của trang tuỳ chọn).
 */
export async function savePreferences(
  _: TokenActionState,
  form: FormData,
): Promise<TokenActionState> {
  const locale = pickLocale(form.get("locale"));
  const t = await getTranslations({ locale, namespace: "newsletter" });
  const keys = form.getAll("all_lists").map(String).slice(0, 50);
  const chosen = new Set(form.getAll("lists").map(String));
  const all = form.get("intent") === "all";
  try {
    const { data, error } = await publicClient(locale, await visitorChain()).PUT(
      "/api/v1/newsletter/public/preferences",
      {
        params: { query: { token: String(form.get("token") ?? "").slice(0, 2000) } },
        body: all
          ? { unsubscribe_all: true }
          : {
              lists: keys.map((key) => ({ key, subscribed: chosen.has(key) })),
              consent_text: t("consent"),
              locale,
            },
      },
    );
    if (data) {
      return { status: "ok", message: all ? t("unsubscribe.done") : t("preferences.saved") };
    }
    return { status: "error", message: isProblem(error) ? problemMessage(error) : t("failed") };
  } catch {
    return { status: "error", message: t("failed") };
  }
}
