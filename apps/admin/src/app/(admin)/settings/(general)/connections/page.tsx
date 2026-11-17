import { ApiError, type components } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { ConnectionDialog } from "@/components/settings/sample-forms";
import { TenantSettingsList } from "@/components/settings/tenant-settings";
import { InlineAction } from "@/components/ui/confirm";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { formatCount } from "@/lib/format";
import { AI_VIEW, TENANT_SETTINGS_MANAGE } from "@/lib/permissions";
import { connectionKind } from "@/lib/tenant-settings";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { type Connection, listConnections } from "@/sample/settings";
import { testConnectionAction } from "../../sample-actions";

type AiStatus = components["schemas"]["AiStatus"];
type TenantSetting = components["schemas"]["TenantSettingState"];

/** Cài đặt theo khách của core (`GET /kernel/settings`); `null` khi core từ chối (403). */
async function tenantSettings(): Promise<TenantSetting[] | null> {
  try {
    return (await load((client) => client.GET("/api/v1/kernel/settings"))).data;
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}

/** Trạng thái AI thật của core, hoặc lý do không đọc được. */
async function aiStatus(): Promise<AiStatus | "forbidden" | "absent"> {
  try {
    return (await load((client) => client.GET("/api/v1/ai/status"))).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return "forbidden";
    // 404: core không cài module `ai`.
    if (error instanceof ApiError && error.status === 404) return "absent";
    throw error;
  }
}

function connectionState(connection: Connection): "set" | "unset" | "error" {
  if (connection.last_check && !connection.last_check.ok) return "error";
  return connection.settings.some((s) => s.is_set) ? "set" : "unset";
}

/** Module của core sẽ nhận từng kết nối mẫu (tên cài đặt `<module>.connection.…`). */
const SAMPLE_MODULE: Record<Connection["id"], string> = {
  mail: "mail",
  sms: "sms",
  payment: "payments",
  einvoice: "invoices",
};

const BADGE = { set: "badge b-ok", unset: "badge b-draft", error: "badge b-bad" } as const;

// Tab "Kết nối đối tác": cài đặt theo khách THẬT của core (`GET/PUT/DELETE /kernel/settings`, bước 33
// — mỗi module khai cài đặt của mình; giá trị bí mật không bao giờ trả lại), trạng thái AI thật
// (`GET /ai/status`, nhà vận hành bật bằng biến môi trường). Nhà cung cấp email, SMS, cổng thanh toán,
// hoá đơn điện tử chưa có ở core (bước 36, 39): khối đó là dữ liệu mẫu, chỉ hiện khi bật dữ liệu mẫu.
export default async function ConnectionsPage() {
  if (!(await can(TENANT_SETTINGS_MANAGE))) {
    const e = await getTranslations("errors");
    return (
      <MessagePanel
        title={e("forbiddenTitle")}
        message={e("forbidden", { permission: TENANT_SETTINGS_MANAGE })}
      />
    );
  }
  const sample = sampleDataEnabled();
  const t = await getTranslations("settings.connections");
  const locale = await getLocale();
  const [connections, ai, settings] = await Promise.all([
    sample ? listConnections().then((r) => r.data) : Promise.resolve(null),
    aiStatus(),
    tenantSettings(),
  ]);
  if (settings === null) notFound();
  // Kết nối core đã nhận thật (vd `mail.connection.smtp.…`, D-297) thì không hiện bản mẫu của nó:
  // dữ liệu mẫu chỉ dành cho phần core chưa có (W-006).
  const real = new Set(settings.map((s) => connectionKind(s.name)?.split(".")[0]));
  const samples = connections?.filter((c) => !real.has(SAMPLE_MODULE[c.id])) ?? null;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="tset-h">
        <div className="block-head">
          <h2 id="tset-h" className="h2">
            {t("tenant.title")}
          </h2>
        </div>
        <p className="fhint">{t("tenant.about")}</p>
        <TenantSettingsList settings={settings} />
      </section>

      <section className="block" aria-labelledby="ai-h">
        <div className="block-head">
          <h2 id="ai-h" className="h2">
            {t("ai.title")}
          </h2>
        </div>
        <div className="card">
          <div className="item" data-testid="ai-status">
            <div className="item-main">
              <span className="item-title">{t("ai.text")}</span>
              {typeof ai === "string" ? (
                <span className="item-meta">
                  {ai === "forbidden" ? t("ai.forbidden", { permission: AI_VIEW }) : t("ai.absent")}
                </span>
              ) : ai.enabled ? (
                <span className="item-meta">
                  {t("ai.model", { provider: ai.provider, model: ai.model })} ·{" "}
                  {ai.images ? t("ai.images") : t("ai.noImages")} ·{" "}
                  {ai.daily_token_limit > 0
                    ? t("ai.tokens", {
                        used: formatCount(ai.tokens_today, locale),
                        limit: formatCount(ai.daily_token_limit, locale),
                      })
                    : t("ai.tokensNoLimit", { used: formatCount(ai.tokens_today, locale) })}
                </span>
              ) : (
                <span className="item-meta">{t("ai.off")}</span>
              )}
            </div>
            {typeof ai === "string" ? null : (
              <span className={ai.enabled ? "badge b-ok" : "badge b-draft"}>
                <span className="dot" />
                {ai.enabled ? t("ai.on") : t("ai.offShort")}
              </span>
            )}
          </div>
          {typeof ai === "string" ? null : (
            <div className="item">
              <div className="item-main">
                <span className="item-title">{t("ai.embeddings")}</span>
                <span className="item-meta">
                  {ai.embeddings_enabled
                    ? t("ai.embeddingModel", {
                        model: ai.embedding_model,
                        dimensions: ai.embedding_dimensions,
                      })
                    : t("ai.embeddingsOff")}
                </span>
              </div>
              <span className={ai.embeddings_enabled ? "badge b-ok" : "badge b-draft"}>
                <span className="dot" />
                {ai.embeddings_enabled ? t("ai.on") : t("ai.offShort")}
              </span>
            </div>
          )}
        </div>
        <p className="fhint">{t("ai.about")}</p>
      </section>

      {samples?.length ? (
        <section className="block" aria-labelledby="conn-h">
          <div className="block-head">
            <h2 id="conn-h" className="h2">
              {t("title")}
            </h2>
            <SampleBadge
              step="33"
              endpoint="GET /api/v1/kernel/settings, PUT /settings/{name}, POST /settings/{name}/test"
            />
          </div>
          <p className="fhint">{t("about")}</p>
          <div className="card">
            {samples.map((connection) => {
              const state = connectionState(connection);
              const name = t(`names.${connection.id}`);
              return (
                <div className="item" key={connection.id} data-testid={`conn-${connection.id}`}>
                  <div className="item-main">
                    <span className="item-title">{name}</span>
                    <span className="item-meta">
                      {connection.settings
                        .map(
                          (s) =>
                            `${s.name}: ${s.is_set ? (s.secret ? t("isSet") : (s.value ?? "")) : t("notSet")}`,
                        )
                        .join(" · ")}
                    </span>
                    {connection.last_check ? (
                      <span className="item-meta">
                        {connection.last_check.ok ? t("checkOk") : t("checkFailed")}{" "}
                        <Time value={connection.last_check.at} />
                        {connection.last_check.error ? ` · ${connection.last_check.error}` : ""}
                      </span>
                    ) : (
                      <span className="item-meta">{t(`hints.${connection.id}`)}</span>
                    )}
                  </div>
                  <span className={BADGE[state]}>
                    <span className="dot" />
                    {t(`state.${state}`)}
                  </span>
                  <span className="item-acts">
                    {state !== "unset" ? (
                      <InlineAction
                        action={testConnectionAction}
                        id={connection.id}
                        label={t("test")}
                        ariaLabel={t("testLabel", { name })}
                        done={t("tested")}
                      />
                    ) : null}
                    <ConnectionDialog
                      id={connection.id}
                      title={t("formTitle", { name })}
                      label={state === "unset" ? t("setUp") : t("change")}
                      fields={connection.settings}
                    />
                  </span>
                </div>
              );
            })}
          </div>
          <p className="note">{t("secretNote")}</p>
        </section>
      ) : null}
    </div>
  );
}
