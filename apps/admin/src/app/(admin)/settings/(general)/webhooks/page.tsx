import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { CreateWebhookDialog } from "@/components/settings/webhook-forms";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { WEBHOOKS_MANAGE } from "@/lib/permissions";
import { type EndpointState, endpointState, shortUrl } from "@/lib/webhooks";

type Delivery = components["schemas"]["DeliveryResponse"];

const STATES: EndpointState[] = ["receiving", "failing", "disabled"];
const BADGE: Record<EndpointState, string> = {
  receiving: "badge b-ok",
  failing: "badge b-bad",
  disabled: "badge b-arch",
};

// Tab "Webhook": endpoint nhận event của hệ thống, kèm lần giao gần nhất. Core chưa trả trạng thái
// giao trong danh sách endpoint, nên đọc lần giao mới nhất của từng endpoint (song song). Lọc theo
// trạng thái trên trang đang xem (tối đa 200 endpoint mỗi trang).
export default async function WebhooksPage(props: PageProps<"/settings/webhooks">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const wanted = STATES.find((s) => s === params.state);
  let page: components["schemas"]["Page_EndpointResponse"];
  let events: components["schemas"]["EventTypeResponse"][];
  try {
    [page, { data: events }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/webhooks", {
          params: { query: { limit: 200, ...(cursor ? { cursor } : {}) } },
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
  const lasts = await Promise.all(
    page.data.map(async (endpoint): Promise<Delivery | null> => {
      const { data } = await load((client) =>
        client.GET("/api/v1/webhooks/{id}/deliveries", {
          params: { path: { id: endpoint.id }, query: { limit: 1 } },
        }),
      );
      return data[0] ?? null;
    }),
  );
  const rows = page.data.map((endpoint, index) => {
    const last = lasts[index] ?? null;
    return { endpoint, last, state: endpointState(endpoint, last) };
  });
  const shown = rows.filter((row) => !wanted || row.state === wanted);
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
          <Link
            className={wanted ? "chip" : "chip on"}
            href="/settings/webhooks"
            aria-current={wanted ? undefined : "page"}
          >
            {t("settings.webhooks.all")} <span className="cnt">{rows.length}</span>
          </Link>
          {STATES.map((s) => (
            <Link
              key={s}
              className={wanted === s ? "chip on" : "chip"}
              href={`/settings/webhooks?state=${s}`}
              aria-current={wanted === s ? "page" : undefined}
            >
              {t(`settings.webhooks.state.${s}`)}{" "}
              <span className="cnt">{rows.filter((r) => r.state === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {shown.length === 0 ? (
            <p className="empty">{t("settings.webhooks.empty")}</p>
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
                {shown.map(({ endpoint, last, state }) => (
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
              <Link className="btn sm" href="/settings/webhooks">
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`/settings/webhooks?cursor=${encodeURIComponent(next)}`}
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
