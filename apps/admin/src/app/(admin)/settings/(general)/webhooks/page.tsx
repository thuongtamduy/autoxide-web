import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { CreateWebhookDialog } from "@/components/settings/webhook-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { WEBHOOKS_MANAGE } from "@/lib/permissions";
import { type EndpointState, endpointState, shortUrl } from "@/lib/webhooks";

/** Bộ lọc của core (`status`): đang nhận event hay đã tắt. */
const STATUSES = ["active", "disabled"] as const;
type Status = (typeof STATUSES)[number];

const BADGE: Record<EndpointState, string> = {
  receiving: "badge b-ok",
  failing: "badge b-bad",
  disabled: "badge b-arch",
};

// Tab "Webhook": endpoint nhận event của hệ thống, kèm lần giao gần nhất (`last_delivery`, đi cùng
// danh sách — không gọi thêm cho từng endpoint). Lọc đang bật / đã tắt ở core (`status`), trên cả
// danh sách chứ không chỉ trang đang xem.
export default async function WebhooksPage(props: PageProps<"/settings/webhooks">) {
  const t = await getTranslations();
  const e = await getTranslations("emptyStates");
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const status: Status | null = STATUSES.find((s) => s === params.status) ?? null;
  const base = status ? `/settings/webhooks?status=${status}` : "/settings/webhooks";
  let page: components["schemas"]["Page_EndpointResponse"];
  let events: components["schemas"]["EventTypeResponse"][];
  try {
    [page, { data: events }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/webhooks", {
          params: {
            query: { limit: 50, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) },
          },
        }),
      ),
      load((client) => client.GET("/api/v1/webhooks/events")),
    ]);
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: WEBHOOKS_MANAGE })}
        />
      );
    }
    throw error;
  }
  const rows = page.data.map((endpoint) => {
    const last = endpoint.last_delivery ?? null;
    return { endpoint, last, state: endpointState(endpoint, last) };
  });
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("settings.webhooks.deleted")} /> : null}
      <section className="block" aria-labelledby="hooks-h">
        <div className="block-head">
          <h2 id="hooks-h" className="h2">
            {t("settings.webhooks.title")}
          </h2>
          <CreateWebhookDialog events={events} />
        </div>
        <p className="fhint">{t("settings.webhooks.about")}</p>
        <nav className="chips" aria-label={t("settings.webhooks.filter")}>
          {[null, ...STATUSES].map((value) => {
            const on = value === status;
            return (
              <Link
                key={value ?? "all"}
                className={on ? "chip on" : "chip"}
                href={value ? `/settings/webhooks?status=${value}` : "/settings/webhooks"}
                aria-current={on ? "page" : undefined}
              >
                {value ? t(`settings.webhooks.status.${value}`) : t("settings.webhooks.all")}
              </Link>
            );
          })}
        </nav>
        <div className="card tcard">
          {rows.length === 0 ? (
            <EmptyState icon="bolt" title={t("settings.webhooks.empty")}>
              {e("webhooks.body")}
            </EmptyState>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("settings.webhooks.endpoint")}</Th>
                  <Th>{t("settings.webhooks.events")}</Th>
                  <Th>{t("settings.webhooks.lastDelivery")}</Th>
                  <Th>{t("settings.webhooks.stateCol")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ endpoint, last, state }) => (
                  <tr key={endpoint.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link className="open mono ell" href={`/settings/webhooks/${endpoint.id}`}>
                          {shortUrl(endpoint.url)}
                        </Link>
                        {endpoint.description ? (
                          <span className="sub">{endpoint.description}</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("settings.webhooks.events")}>
                      <span className="mono">
                        {endpoint.events.includes("*")
                          ? t("settings.webhooks.allEvents")
                          : endpoint.events.join(", ")}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap" label={t("settings.webhooks.lastDelivery")}>
                      {last ? (
                        <>
                          <Time value={last.last_attempt_at ?? last.created_at} />
                          {last.response_status ? ` · HTTP ${last.response_status}` : ""}
                        </>
                      ) : (
                        t("settings.webhooks.never")
                      )}
                    </Td>
                    <Td label={t("settings.webhooks.stateCol")}>
                      <span className={BADGE[state]}>
                        <span className="dot" />
                        {t(`settings.webhooks.state.${state}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {cursor || next ? (
          <nav className="pager" aria-label={t("access.pages")}>
            {cursor ? (
              <Link className="btn sm" href={base}>
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`${base}${status ? "&" : "?"}cursor=${encodeURIComponent(next)}`}
              >
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
