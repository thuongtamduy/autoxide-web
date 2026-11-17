import { ApiError, type components } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import {
  BusinessSettings,
  CATEGORY_ICON,
  ConnectionCard,
  fieldText,
  kindText,
  RealConnectionCard,
} from "@/components/settings/connections";
import { ConnectionDialog } from "@/components/settings/sample-forms";
import { Icon } from "@/components/shell/icon";
import { InlineAction } from "@/components/ui/confirm";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { formatCount } from "@/lib/format";
import { AI_VIEW, TENANT_SETTINGS_MANAGE } from "@/lib/permissions";
import {
  CONNECTION_CATEGORIES,
  type ConnectionCategory,
  connectionKind,
  connectionStatus,
  groupConnections,
  splitSettings,
} from "@/lib/tenant-settings";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { type Connection, listConnections } from "@/sample/settings";
import { testConnectionAction } from "../../sample-actions";
import "@/components/settings/settings.css";

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

/** Loại kết nối (`<module>.<loại>`) của một kết nối mẫu, đọc từ tên cài đặt của nó. */
function sampleKind(connection: Connection): string {
  const first = connection.settings[0]?.name ?? connection.id;
  return connectionKind(first) ?? connection.id;
}

// Tab "Kết nối đối tác" (chuẩn hoá giao diện, W-054), theo cách của Shopify "Apps & sales channels" / Vercel
// Integrations: nhóm theo loại đối tác có biểu tượng, mỗi kết nối một thẻ (tên dễ hiểu, một dòng mô
// tả, trạng thái, nút Cấu hình / Sửa mở hộp thoại; tên kỹ thuật chỉ hiện nhỏ trong hộp thoại).
// - Kết nối thật: cài đặt nhóm `connection` của core (`GET/PUT/DELETE /kernel/settings`, D-297),
//   gom theo `<module>.connection.<loại>`; secret không bao giờ trả lại.
// - AI của máy chủ: `GET /ai/status` (nhà vận hành bật), chỉ xem.
// - Nhà cung cấp core chưa nhận (SMS, cổng thanh toán, hoá đơn điện tử — bước 36, 39): dữ liệu mẫu
//   (W-006), chỉ khi bật dữ liệu mẫu, nằm cùng nhóm với kết nối thật, có nhãn mẫu.
// - Cấu hình nghiệp vụ theo khách (không phải kết nối): khối riêng ở cuối.
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
  const { connection, business } = splitSettings(settings);
  const real = groupConnections(connection);
  // Kết nối core đã nhận thật (vd `mail.connection.smtp.…`, D-297) thì không hiện bản mẫu của nó:
  // dữ liệu mẫu chỉ dành cho phần core chưa có (W-006).
  const realModules = new Set(real.map((group) => group.module));
  const samples = (connections ?? []).filter(
    (c) => !realModules.has(sampleKind(c).split(".")[0] ?? ""),
  );

  const cards = new Map<ConnectionCategory, ReactNode[]>();
  const add = (category: ConnectionCategory, card: ReactNode) =>
    cards.set(category, [...(cards.get(category) ?? []), card]);

  for (const group of real) {
    add(
      group.category,
      <RealConnectionCard
        key={group.kind}
        kind={group.kind}
        icon={CATEGORY_ICON[group.category]}
        settings={group.settings}
      />,
    );
  }

  for (const item of samples) {
    const kind = sampleKind(item);
    const group = groupConnections(item.settings)[0];
    const category = group?.category ?? "other";
    const { name, about } = kindText(t, kind, "");
    const status = connectionStatus(item.settings, item.last_check);
    add(
      category,
      <ConnectionCard
        key={`sample-${item.id}`}
        testId={`conn-${item.id}`}
        icon={CATEGORY_ICON[category]}
        name={name}
        about={about}
        status={status}
        statusLabel={t(`status.${status}`)}
        badge={
          <SampleBadge
            step={item.id === "einvoice" ? "39" : "36"}
            endpoint="GET /api/v1/kernel/settings, PUT /settings/{name}, POST /settings/{name}/test"
          />
        }
        meta={
          item.last_check ? (
            <span className={item.last_check.ok ? undefined : "conn-error"}>
              {item.last_check.ok ? t("checkOk") : t("checkFailed")}{" "}
              <Time value={item.last_check.at} />
              {item.last_check.error ? ` · ${item.last_check.error}` : ""}
            </span>
          ) : status === "unset" ? (
            t("notConnected")
          ) : null
        }
        actions={
          <>
            <ConnectionDialog
              id={item.id}
              title={t("configureLabel", { name })}
              label={status === "unset" ? t("configure") : t("edit")}
              ariaLabel={t("configureLabel", { name })}
              about={about}
              primary={status === "unset"}
              fields={item.settings.map((s) => ({ ...s, ...fieldText(t, s) }))}
            />
            {status !== "unset" ? (
              <InlineAction
                action={testConnectionAction}
                id={item.id}
                label={t("test")}
                ariaLabel={t("testLabel", { name })}
                done={t("tested")}
              />
            ) : null}
          </>
        }
      />,
    );
  }

  // AI của máy chủ: nhà vận hành bật, khách chỉ xem; đứng cạnh tài khoản AI riêng (nếu có).
  if (ai !== "absent") {
    add(
      "ai",
      <ConnectionCard
        key="ai-status"
        testId="ai-status"
        icon={CATEGORY_ICON.ai}
        name={t("ai.name")}
        about={t("ai.about")}
        status={typeof ai !== "string" && ai.enabled ? "connected" : "unset"}
        statusLabel={
          typeof ai === "string" ? t("ai.unknown") : ai.enabled ? t("ai.on") : t("ai.offShort")
        }
        meta={
          typeof ai === "string" ? (
            t("ai.forbidden", { permission: AI_VIEW })
          ) : ai.enabled ? (
            <>
              <span>
                {t("ai.model", { provider: ai.provider, model: ai.model })} ·{" "}
                {ai.images ? t("ai.images") : t("ai.noImages")}
              </span>
              <span>
                {ai.daily_token_limit > 0
                  ? t("ai.tokens", {
                      used: formatCount(ai.tokens_today, locale),
                      limit: formatCount(ai.daily_token_limit, locale),
                    })
                  : t("ai.tokensNoLimit", { used: formatCount(ai.tokens_today, locale) })}
              </span>
              <span>
                {t("ai.embeddings")}:{" "}
                {ai.embeddings_enabled
                  ? t("ai.embeddingModel", {
                      model: ai.embedding_model,
                      dimensions: ai.embedding_dimensions,
                    })
                  : t("ai.embeddingsOff")}
              </span>
            </>
          ) : (
            t("ai.off")
          )
        }
      />,
    );
  }

  const shown = CONNECTION_CATEGORIES.filter((category) => cards.get(category)?.length);
  return (
    <div className="blocks conn">
      <p className="conn-intro">{t("intro")}</p>
      {shown.length === 0 && business.length === 0 ? (
        <div className="card">
          <p className="empty">{t("tenant.empty")}</p>
        </div>
      ) : null}
      {shown.map((category) => (
        <section
          key={category}
          className="block conn-sec"
          aria-labelledby={`conn-${category}-h`}
          data-testid={`conn-cat-${category}`}
        >
          <div className="conn-cat">
            <span className="conn-cat-ic" aria-hidden="true">
              <Icon name={CATEGORY_ICON[category]} />
            </span>
            <div className="conn-cat-text">
              <h2 id={`conn-${category}-h`} className="h2">
                {t(`categories.${category}.title`)}
              </h2>
              <p className="conn-cat-about">{t(`categories.${category}.about`)}</p>
            </div>
          </div>
          <div className="conn-grid">{cards.get(category)}</div>
        </section>
      ))}

      {business.length ? (
        <section
          className="block conn-sec"
          aria-labelledby="conn-business-h"
          data-testid="tset-business"
        >
          <div className="conn-cat">
            <span className="conn-cat-ic" aria-hidden="true">
              <Icon name="gear" />
            </span>
            <div className="conn-cat-text">
              <h2 id="conn-business-h" className="h2">
                {t("business.title")}
              </h2>
              <p className="conn-cat-about">{t("business.about")}</p>
            </div>
          </div>
          <BusinessSettings settings={business} />
        </section>
      ) : null}

      <p className="note">{t("secretNote")}</p>
    </div>
  );
}
