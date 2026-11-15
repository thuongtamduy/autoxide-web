import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { disableWebhook, enableWebhook } from "@/app/(admin)/settings/actions";
import { MessagePanel } from "@/components/message-panel";
import {
  DeleteWebhookDialog,
  RotateSecretDialog,
  WebhookEditForm,
} from "@/components/settings/webhook-forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load, loadTagged } from "@/lib/core";
import { WEBHOOKS_MANAGE } from "@/lib/permissions";
import { DELIVERY_BADGE, shortUrl } from "@/lib/webhooks";

type Endpoint = components["schemas"]["EndpointResponse"];

// Một endpoint: sửa địa chỉ / event (gửi `If-Match`), tắt / bật, thay secret ký, xoá, và các lần
// giao gần đây (giữ 30 ngày, theo trang).
export default async function WebhookPage(props: PageProps<"/settings/webhooks/[id]">) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const t = await getTranslations();
  let endpoint: Endpoint;
  let etag: string | null;
  let events: components["schemas"]["EventTypeResponse"][];
  let deliveries: components["schemas"]["Page_DeliveryResponse"];
  try {
    [
      {
        data: { data: endpoint },
        etag,
      },
      { data: events },
      deliveries,
    ] = await Promise.all([
      loadTagged((client) => client.GET("/api/v1/webhooks/{id}", { params: { path: { id } } })),
      load((client) => client.GET("/api/v1/webhooks/events")),
      load((client) =>
        client.GET("/api/v1/webhooks/{id}/deliveries", {
          params: { path: { id }, query: { limit: 25, ...(cursor ? { cursor } : {}) } },
        }),
      ),
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
    if (isNotFound(error)) notFound();
    throw error;
  }
  const next = deliveries.pagination.next_cursor;
  const base = `/settings/webhooks/${id}`;
  const w = (key: string, values?: Record<string, string>) => t(`settings.webhooks.${key}`, values);
  return (
    <div className="blocks">
      <nav className="back" aria-label={w("breadcrumb")}>
        <Link href="/settings/webhooks" className="btn ghost sm">
          <span aria-hidden="true">←</span> {w("back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="hook-h">
        <div className="block-head">
          <h2 id="hook-h" className="h2 mono ell">
            {shortUrl(endpoint.url)}
          </h2>
          <span className={endpoint.disabled_at ? "badge b-arch" : "badge b-ok"}>
            <span className="dot" />
            {endpoint.disabled_at ? w("state.disabled") : w("state.receiving")}
          </span>
        </div>
        <p className="fhint">
          {w("createdAt")} <Time value={endpoint.created_at} />
          {endpoint.disabled_at ? (
            <>
              {" · "}
              {w("disabledAt")} <Time value={endpoint.disabled_at} />
            </>
          ) : null}
        </p>
        <div className="row-acts start">
          {endpoint.disabled_at ? (
            <InlineAction action={enableWebhook} id={id} label={w("enable")} done={w("enabled")} />
          ) : (
            <ConfirmAction
              action={disableWebhook}
              id={id}
              label={w("disable")}
              title={w("disableTitle")}
              points={[w("disableStops"), w("disableRetries"), w("disableBack")]}
              submit={w("disableSubmit")}
              done={w("disabled")}
              danger={false}
            />
          )}
          <RotateSecretDialog id={id} />
          <DeleteWebhookDialog id={id} url={shortUrl(endpoint.url)} />
        </div>
      </section>

      <section className="block" aria-labelledby="edit-h">
        <h3 id="edit-h" className="h2">
          {w("editTitle")}
        </h3>
        <div className="card padded">
          <WebhookEditForm endpoint={endpoint} etag={etag} events={events} />
        </div>
      </section>

      <section className="block" aria-labelledby="del-h">
        <h3 id="del-h" className="h2">
          {w("deliveries")}
        </h3>
        <p className="fhint">{w("deliveriesAbout")}</p>
        <div className="card tcard">
          {deliveries.data.length === 0 ? (
            <p className="empty">{w("noDeliveries")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{w("event")}</Th>
                  <Th>{w("when")}</Th>
                  <Th>{w("attempts")}</Th>
                  <Th>{w("answer")}</Th>
                  <Th>{w("stateCol")}</Th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.map((delivery) => (
                  <tr key={delivery.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono">{delivery.event_name}</b>
                        <span className="sub mono">{delivery.id}</span>
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap" label={w("when")}>
                      <Time value={delivery.created_at} />
                    </Td>
                    <Td className="tabular-nums" label={w("attempts")}>
                      {delivery.attempts}
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
                        {t.has(`settings.webhooks.delivery.${delivery.status}`)
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
        {cursor || next ? (
          <nav className="pager" aria-label={t("access.pages")}>
            {cursor ? (
              <Link className="btn sm" href={base}>
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link className="btn sm" href={`${base}?cursor=${encodeURIComponent(next)}`}>
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
