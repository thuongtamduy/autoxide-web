import { getTranslations } from "next-intl/server";
import { savePrefsAction } from "@/app/(admin)/work/actions";
import { SampleBadge } from "@/components/sample-badge";
import { InlineForm } from "@/components/ui/form-dialog";
import { getMe } from "@/lib/viewer";
import { getNotificationPrefs } from "@/sample/work";
import { sampleOnly } from "../sample-gate";

const PREFS = ["mention", "assigned", "approval", "digest"] as const;

// Tab "Tuỳ chọn thông báo": chọn khi nào nhận tin, qua kênh nào. Module `notifications` của core chưa
// có (bước 37 / 52): dữ liệu mẫu (W-006). Thông báo gửi chậm chưa biết ngôn ngữ của người nhận vì core
// chưa lưu "ngôn ngữ ưa thích" — ghi ở chỗ thiếu API.
export default async function NotificationsPage() {
  sampleOnly();
  const [t, me] = await Promise.all([getTranslations("work.notify"), getMe()]);
  const { data: prefs } = await getNotificationPrefs(me.id);
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="wk-notify-h">
        <div className="block-head">
          <h2 id="wk-notify-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge
            step="37"
            endpoint="GET/PUT /api/v1/me/notification-preferences (module notifications, bước 37 / 52)"
          />
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card wk-pad">
          <InlineForm
            action={savePrefsAction}
            submit={t("save")}
            done={t("saved")}
            fields={PREFS.map((name) => ({
              kind: "check" as const,
              name,
              label: t(`prefs.${name}.label`),
              hint: t(`prefs.${name}.hint`),
              defaultChecked: prefs[name],
            }))}
          />
        </div>
      </section>
      <p className="note warn block half">
        <b>{t("languageTitle")}</b> {t("languageNote")}
      </p>
    </div>
  );
}
