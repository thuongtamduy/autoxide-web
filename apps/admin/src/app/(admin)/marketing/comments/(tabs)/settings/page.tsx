import { getTranslations } from "next-intl/server";
import { PolicyForm, ProfileForm } from "@/components/engage/comment-forms";
import { Facts } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { load } from "@/lib/core";
import { COMMENTS_MANAGE } from "@/lib/engage";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { getCommentPolicy } from "@/sample/engage";

// Tab "Cài đặt": cài đặt đang chạy của máy chủ (đọc `GET /comments/public/settings`; đặt bằng
// biến môi trường `AUTOXIDE_COMMENTS_*`), tên hiển thị của chính người quản trị khi bình luận, và
// cài đặt theo từng khách — chưa có API (bước 33, 37), dựng bằng dữ liệu mẫu (W-006).
export default async function CommentSettingsPage() {
  const t = await getTranslations("engage.comments");
  const [settings, manage] = await Promise.all([
    load((client) => client.GET("/api/v1/comments/public/settings")),
    can(COMMENTS_MANAGE),
  ]);
  const s = settings.data;
  let profile: string | null | undefined;
  try {
    profile = (await load((client) => client.GET("/api/v1/comments/profile"))).data.display_name;
  } catch {
    // Thiếu `comments.post`: không hiện ô tên hiển thị.
    profile = undefined;
  }
  const sample = manage && sampleDataEnabled() ? (await getCommentPolicy()).data : null;
  const yes = (on: boolean) => (on ? t("yes") : t("no"));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="srv-h">
        <h2 id="srv-h" className="h2">
          {t("serverSettings")}
        </h2>
        <p className="fhint">{t("serverSettingsAbout")}</p>
        <div className="card padded">
          <Facts
            items={[
              [t("set.enabled"), yes(s.enabled)],
              [t("set.guests"), yes(s.guests_allowed)],
              [t("set.signedInOnly"), s.signed_in_only_types.join(", ") || t("none")],
              [t("set.verifiedOnly"), s.verified_only_types.join(", ") || t("none")],
              [t("set.markdown"), yes(s.markdown)],
              [t("set.types"), s.target_types.join(", ") || t("none")],
              [t("set.maxLength"), String(s.max_length)],
              [t("set.maxLinks"), String(s.max_links)],
              [t("set.editMinutes"), t("minutes", { count: s.edit_minutes })],
              [t("set.replyMails"), yes(s.reply_mails)],
            ]}
          />
        </div>
        <p className="note">{t("serverSettingsLaw")}</p>
      </section>
      {profile !== undefined ? (
        <section className="block" aria-labelledby="prof-h">
          <h2 id="prof-h" className="h2">
            {t("profile.title")}
          </h2>
          <div className="card padded">
            <ProfileForm current={profile} />
          </div>
        </section>
      ) : null}
      {sample ? (
        <section className="block" aria-labelledby="pol-h">
          <div className="block-head">
            <h2 id="pol-h" className="h2">
              {t("policy.title")}
            </h2>
            <SampleBadge
              step="33 · 37"
              endpoint="PUT /api/v1/kernel/settings/{name}, PUT /api/v1/compliance/policies/posting.comments"
            />
          </div>
          <p className="fhint">{t("policy.about")}</p>
          <div className="card padded">
            <PolicyForm initial={sample} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
