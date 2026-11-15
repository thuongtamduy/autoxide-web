import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TipHeading } from "@/components/help/info-tip";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { WEBHOOKS_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { DELIVERY_BADGE, mergeDeliveries, shortUrl } from "@/lib/webhooks";

const STATUSES = ["failed", "pending", "succeeded"] as const;
/** Lần giao đọc từ mỗi endpoint: đủ cho "gần đây" mà không đọc cả 30 ngày. */
const PER_ENDPOINT = 25;

// Tab "Webhook" của Nhà phát triển: lần giao gần đây của mọi endpoint, gộp lại. Core chưa có danh
// sách lần giao xuyên endpoint (bước 52): đọc `/webhooks/{id}/deliveries` của từng endpoint (song
// song) rồi gộp theo thời gian.
export default async function DeliveriesPage(props: PageProps<"/settings/developers">) {
  // Không quản lý webhook (layout đã chặn người không có tab nào): mở tab nhật ký request.
  if (!(await can(WEBHOOKS_MANAGE))) redirect("/settings/developers/requests");
  const t = await getTranslations("settings.developers");
  const w = await getTranslations("settings.webhooks");
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const { data: endpoints } = await load((client) =>
    client.GET("/api/v1/webhooks", { params: { query: { limit: 200 } } }),
  );
  const lists = await Promise.all(
    endpoints.map(async (endpoint) => {
      const page: components["schemas"]["Page_DeliveryResponse"] = await load((client) =>
        client.GET("/api/v1/webhooks/{id}/deliveries", {
          params: { path: { id: endpoint.id }, query: { limit: PER_ENDPOINT } },
        }),
      );
      return { endpoint, deliveries: page.data };
    }),
  );
  const all = mergeDeliveries(lists, { limit: 500 });
  const rows = mergeDeliveries(lists, current ? { status: current } : {});
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="dlv-h">
        <div className="block-head">
          <TipHeading id="dlv-h" tip="deliveries">
            {t("deliveries")}
          </TipHeading>
          <Link className="btn sm" href="/settings/webhooks">
            {t("manageEndpoints")}
          </Link>
        </div>
        <p className="fhint">{t("deliveriesAbout")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={current ? "chip" : "chip on"}
            href="/settings/developers"
            aria-current={current ? undefined : "page"}
          >
            {t("all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={`/settings/developers?status=${s}`}
              aria-current={current === s ? "page" : undefined}
            >
              {w(`delivery.${s}`)}{" "}
              <span className="cnt">{all.filter((d) => d.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{endpoints.length === 0 ? t("noEndpoints") : w("noDeliveries")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{w("event")}</Th>
                  <Th>{w("endpoint")}</Th>
                  <Th>{w("when")}</Th>
                  <Th>{w("answer")}</Th>
                  <Th>{w("stateCol")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((delivery) => (
                  <tr key={delivery.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono">{delivery.event_name}</b>
                        <span className="sub">
                          {w("attemptCount", { count: delivery.attempts })}
                        </span>
                      </span>
                    </Td>
                    <Td label={w("endpoint")}>
                      <Link
                        className="open mono ell"
                        href={`/settings/webhooks/${delivery.endpoint.id}`}
                      >
                        {shortUrl(delivery.endpoint.url)}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap" label={w("when")}>
                      <Time value={delivery.last_attempt_at ?? delivery.created_at} />
                    </Td>
                    <Td label={w("answer")}>
                      <span className="cell2">
                        <span>
                          {delivery.response_status ? `HTTP ${delivery.response_status}` : "—"}
                        </span>
                        {delivery.last_error ? (
                          <span className="sub">{delivery.last_error}</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={w("stateCol")}>
                      <span className={DELIVERY_BADGE[delivery.status] ?? "badge"}>
                        <span className="dot" />
                        {STATUSES.some((s) => s === delivery.status)
                          ? w(`delivery.${delivery.status}`)
                          : delivery.status}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <p className="note">{t("resendNote")}</p>
      </section>
    </div>
  );
}
