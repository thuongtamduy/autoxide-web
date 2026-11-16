"use server";

import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { ActionState } from "./action-state";
import { formToken } from "./antispam-actions";
import { publicClient, visitorChain } from "./core";
import { isProblem, problemMessage } from "./problem";

// Gửi bình luận của khách (`POST /api/v1/comments/public/comments`). Core kiểm mọi thứ (độ dài,
// số link, chặn, chống spam) và quyết hiện ngay hay chờ duyệt; website chỉ báo lại.

export interface CommentState {
  status: "idle" | "published" | "pending" | "error";
  message: string;
}

const locales = routing.locales as readonly string[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function postComment(_: CommentState, form: FormData): Promise<CommentState> {
  const raw = String(form.get("locale") ?? "");
  const locale = locales.includes(raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "comments" });
  const targetType = String(form.get("target_type") ?? "");
  const targetId = String(form.get("target_id") ?? "");
  const parent = String(form.get("parent_id") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const token =
    String(form.get("form_token") ?? "") ||
    (await formToken(String(form.get("token_scope") ?? ""), locale)) ||
    null;
  try {
    const { data, error } = await publicClient(locale, await visitorChain()).POST(
      "/api/v1/comments/public/comments",
      {
        body: {
          target_type: targetType,
          target_id: targetId,
          body: String(form.get("body") ?? ""),
          author_name: String(form.get("author_name") ?? "").trim() || null,
          email: email || null,
          notify_replies: form.get("notify") === "on" && email !== "",
          parent_id: UUID.test(parent) ? parent : null,
          format: form.get("format") === "markdown" ? "markdown" : "text",
          locale,
          form_token: token,
          trap: String(form.get("trap") ?? "") || null,
        },
      },
    );
    if (data) {
      return data.data.status === "published"
        ? { status: "published", message: t("published") }
        : { status: "pending", message: t("pending") };
    }
    return { status: "error", message: isProblem(error) ? problemMessage(error) : t("failed") };
  } catch {
    return { status: "error", message: t("failed") };
  }
}

/** Xác nhận email nhận thông báo trả lời, hoặc ngừng nhận (link trong thư; chỉ chạy khi bấm nút). */
export async function commentMailLink(_: ActionState, form: FormData): Promise<ActionState> {
  const raw = String(form.get("locale") ?? "");
  const locale = locales.includes(raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "comments" });
  const token = String(form.get("token") ?? "").slice(0, 2000);
  const client = publicClient(locale, await visitorChain());
  try {
    if (form.get("intent") === "unsubscribe") {
      const { data } = await client.POST("/api/v1/comments/public/unsubscribe", {
        body: { token },
      });
      return data
        ? { status: "ok", message: t("unsubscribed") }
        : { status: "error", message: t("linkInvalid") };
    }
    const { data } = await client.POST("/api/v1/comments/public/verify", { body: { token } });
    return data
      ? { status: "ok", message: t("verified") }
      : { status: "error", message: t("linkInvalid") };
  } catch {
    return { status: "error", message: t("failed") };
  }
}
