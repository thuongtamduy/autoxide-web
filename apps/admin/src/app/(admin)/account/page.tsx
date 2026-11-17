import { getTranslations } from "next-intl/server";
import {
  CancelEmailChange,
  ChangeEmailDialog,
  ResendVerification,
} from "@/components/account/email";
import { ProfileForm } from "@/components/account/profile-form";
import { Icon } from "@/components/shell/icon";
import { Time } from "@/components/ui/time";
import { loadConfirmMethods } from "@/lib/confirm-server";
import { load } from "@/lib/core";
import { getCurrentTenant, getMe } from "@/lib/viewer";

// Tab "Hồ sơ": tên, ngôn ngữ và múi giờ ưa thích (`PATCH /auth/me`, bước 34 của core), email và
// trạng thái xác minh, email đang chờ xác minh sau khi xin đổi (huỷ được), và "Nơi bạn làm việc":
// các nút tổ chức (tên nút core trả kèm, D-333) và role ở đó (`GET /auth/me/memberships`), các khách vào được
// (`GET /auth/me/tenants`: của mình, qua uỷ quyền, qua quyền vào hỗ trợ).
export default async function ProfilePage() {
  const t = await getTranslations("account.profile");
  const me = await getMe();
  const [memberships, tenants, current] = await Promise.all([
    load((c) => c.GET("/api/v1/auth/me/memberships")).then((r) => r.data),
    load((c) => c.GET("/api/v1/auth/me/tenants")).then((r) => r.data),
    getCurrentTenant(),
  ]);
  // Gợi ý múi giờ: danh sách của máy chủ Node, thêm tên thường dùng ở Việt Nam (ICU gọi nó là
  // `Asia/Saigon`; core nhận cả hai).
  const zones = ["Asia/Ho_Chi_Minh", ...Intl.supportedValuesOf("timeZone")];
  const verified = me.email_verified_at ?? null;
  const pending = me.pending_email ?? null;
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="profile-h">
        <h2 id="profile-h" className="h2">
          {t("title")}
        </h2>
        <ProfileForm
          name={me.name}
          locale={me.locale ?? ""}
          timeZone={me.time_zone ?? ""}
          zones={zones}
        />
        <p className="fhint">
          {t("since")} <Time value={me.created_at} />
        </p>
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
              <ChangeEmailDialog methods={await loadConfirmMethods()} />
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
      <section className="block" aria-labelledby="where-h">
        <h2 id="where-h" className="h2">
          {t("where")}
        </h2>
        <p className="fhint">{t("whereHint")}</p>
        <div className="card list" data-testid="my-units">
          {memberships.length === 0 ? (
            <p className="empty">{t("noUnits")}</p>
          ) : (
            memberships.map((m) => (
              <div className="item" key={m.org_id}>
                <span className="sq-ic">
                  <Icon name="org" />
                </span>
                <span className="item-main">
                  <span className="item-title ell">
                    {m.org_name ??
                      (m.org_id === current?.id ? (current?.name ?? t("root")) : m.org_id)}
                  </span>
                  <span className="item-meta mono">{m.roles.map((r) => r.name).join(", ")}</span>
                </span>
              </div>
            ))
          )}
        </div>
        {tenants.length > 1 ? (
          <>
            <h3 className="h2">{t("tenants")}</h3>
            <div className="card list" data-testid="my-tenants">
              {tenants.map((tenant) => (
                <div className="item" key={tenant.id}>
                  <span className="item-main">
                    <span className="item-title ell">{tenant.name}</span>
                    <span className="item-meta mono">{tenant.slug}</span>
                  </span>
                  <span className={tenant.access === "direct" ? "badge b-ok" : "badge b-warn"}>
                    {t(
                      `access.${tenant.access === "delegation" || tenant.access === "support" ? tenant.access : "direct"}`,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
