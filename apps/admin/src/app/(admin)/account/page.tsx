import { getTranslations } from "next-intl/server";
import {
  CancelEmailChange,
  ChangeEmailDialog,
  ResendVerification,
} from "@/components/account/email";
import { Icon } from "@/components/shell/icon";
import { Time } from "@/components/ui/time";
import { getMe } from "@/lib/viewer";

// Tab "Hồ sơ": tên, email và trạng thái xác minh, email đang chờ xác minh sau khi xin đổi (huỷ được).
// Core chưa có endpoint để người dùng tự đổi tên (`PATCH /me`, bước 34 của core): tên chỉ hiện,
// quản trị viên đổi được ở màn người dùng.
export default async function ProfilePage() {
  const t = await getTranslations("account.profile");
  const me = await getMe();
  const verified = me.email_verified_at ?? null;
  const pending = me.pending_email ?? null;
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="profile-h">
        <h2 id="profile-h" className="h2">
          {t("title")}
        </h2>
        <dl className="card kv">
          <div>
            <dt>{t("name")}</dt>
            <dd>{me.name || "—"}</dd>
            <dd className="fhint">{t("nameHint")}</dd>
          </div>
          <div>
            <dt>{t("since")}</dt>
            <dd>
              <Time value={me.created_at} />
            </dd>
          </div>
        </dl>
      </section>
      <section className="block half" aria-labelledby="email-h">
        <h2 id="email-h" className="h2">
          {t("email")}
        </h2>
        <div className="card list">
          <div className="item">
            <span className={verified ? "sq-ic ok" : "sq-ic warn"}>
              <Icon name="mail" />
            </span>
            <span className="item-main">
              <span className="item-title mono ell" data-testid="account-email">
                {me.email}
              </span>
              <span className="item-meta">
                {verified ? (
                  <>
                    {t("verifiedOn")} <Time value={verified} />
                  </>
                ) : (
                  t("unverifiedHint")
                )}
              </span>
            </span>
            <span className={verified ? "badge b-ok" : "badge b-warn"}>
              <span className="dot" />
              {verified ? t("verified") : t("unverified")}
            </span>
            <span className="item-acts">
              {verified ? null : <ResendVerification email={me.email} />}
              <ChangeEmailDialog />
            </span>
          </div>
          {pending ? (
            <div className="item" data-testid="pending-email">
              <span className="sq-ic warn">
                <Icon name="mail" />
              </span>
              <span className="item-main">
                <span className="item-title mono ell">{pending.email}</span>
                <span className="item-meta">
                  {t("pendingHint")} <Time value={pending.expires_at} />
                </span>
              </span>
              <span className="badge b-warn">
                <span className="dot" />
                {t("pending")}
              </span>
              <span className="item-acts">
                <CancelEmailChange email={pending.email} />
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
