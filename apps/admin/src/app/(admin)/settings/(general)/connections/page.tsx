import { ApiError, type components } from "@autoxide/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { ConnectionDialog } from "@/components/settings/sample-forms";
import { InlineAction } from "@/components/ui/confirm";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { formatCount } from "@/lib/format";
import { AI_VIEW, TENANT_SETTINGS_MANAGE } from "@/lib/permissions";
import { type Connection, listConnections } from "@/sample/settings";
import { testConnectionAction } from "../../sample-actions";

type AiStatus = components["schemas"]["AiStatus"];

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

const BADGE = { set: "badge b-ok", unset: "badge b-draft", error: "badge b-bad" } as const;

// Tab "Kết nối đối tác": email, SMS, cổng thanh toán, hoá đơn điện tử — cài đặt theo khách (dữ
// liệu mẫu, chờ `/api/v1/kernel/settings` của bước 33 và nhà cung cấp của bước 36, 39); AI đọc thật
// `GET /api/v1/ai/status` (nhà vận hành bật bằng biến môi trường, không đổi ở đây).
export default async function ConnectionsPage() {
  const gate = await sampleGate(TENANT_SETTINGS_MANAGE);
  if (gate) return gate;
  const t = await getTranslations("settings.connections");
  const locale = await getLocale();
  const [{ data: connections }, ai] = await Promise.all([listConnections(), aiStatus()]);
  return (
    <div className="blocks">
      <p className="note warn">{t("agentNote")}</p>

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
          {connections.map((connection) => {
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
    </div>
  );
}
