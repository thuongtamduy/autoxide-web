import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  bulkDeleteWebhooks,
  bulkDisableWebhooks,
  bulkEnableWebhooks,
  changeWebhook,
  deleteWebhook,
} from "@/app/(admin)/settings/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { MessagePanel } from "@/components/message-panel";
import { CreateWebhookDialog } from "@/components/settings/webhook-forms";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { EmptyState } from "@/components/ui/empty-state";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { WEBHOOKS_MANAGE } from "@/lib/permissions";
import { withQuery } from "@/lib/table";
import { type EndpointState, endpointState, shortUrl } from "@/lib/webhooks";

type Endpoint = components["schemas"]["EndpointResponse"];

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
// danh sách chứ không chỉ trang đang xem. Bộ bảng (W-058): chọn nhiều để tắt / bật / xoá (lặp lệnh từng
// cái của core), "⋯" trên dòng (mở, tắt / bật có Hoàn tác, xoá hỏi lại), phân trang theo con trỏ. Bảng
// không có cột thời gian nên không sắp theo cột.
export default async function WebhooksPage(props: PageProps<"/settings/webhooks">) {
  const t = await getTranslations();
  const e = await getTranslations("emptyStates");
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const status: Status | null = STATUSES.find((s) => s === params.status) ?? null;
  const base = "/settings/webhooks";
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
  const w = (key: string, values?: Record<string, string>) => t(`settings.webhooks.${key}`, values);
  const bulk: BulkActionSpec[] = [
    { key: "disable", label: w("disable"), run: bulkDisableWebhooks },
    { key: "enable", label: w("enable"), run: bulkEnableWebhooks },
    {
      key: "delete",
      label: w("delete"),
      tone: "danger",
      run: bulkDeleteWebhooks,
      confirm: {
        title: w("bulkDeleteTitle"),
        points: [w("deleteStops"), w("deleteHistory"), w("deleteNoUndo")],
        submit: w("deleteSubmit"),
      },
    },
  ];
  const undo = { label: w("undo"), done: w("undone") };
  // "⋯" của một dòng: mở, tắt / bật (có Hoàn tác), xoá (hỏi lại, về danh sách).
  const menu = (endpoint: Endpoint): RowMenuItem[] => [
    { label: w("open"), href: `/settings/webhooks/${endpoint.id}` },
    endpoint.disabled_at
      ? {
          label: w("enable"),
          change: {
            action: changeWebhook,
            id: endpoint.id,
            expect: endpoint.updated_at,
            value: "active",
            done: w("enabled"),
            undo,
          },
        }
      : {
          label: w("disable"),
          change: {
            action: changeWebhook,
            id: endpoint.id,
            expect: endpoint.updated_at,
            value: "disabled",
            done: w("disabled"),
            undo,
          },
        },
    {
      label: w("delete"),
      danger: true,
      dialog: (
        <ConfirmButton
          action={deleteWebhook}
          fields={{ id: endpoint.id }}
          label={w("delete")}
          title={w("deleteTitle", { url: shortUrl(endpoint.url) })}
          points={[w("deleteStops"), w("deleteHistory"), w("deleteNoUndo")]}
          submit={w("deleteSubmit")}
        />
      ),
    },
  ];
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
            <BulkTable ids={rows.map((row) => row.endpoint.id)} actions={bulk}>
              <Table cards>
                <thead>
                  <tr>
                    <SelectAllTh />
                    <Th>{w("endpoint")}</Th>
                    <Th>{w("events")}</Th>
                    <Th>{w("lastDelivery")}</Th>
                    <Th>{w("stateCol")}</Th>
                    <Th>
                      <span className="vh">{w("actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ endpoint, last, state }) => (
                    <tr key={endpoint.id}>
                      <SelectTd id={endpoint.id} name={shortUrl(endpoint.url)} />
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open mono ell"
                            href={`/settings/webhooks/${endpoint.id}`}
                          >
                            {shortUrl(endpoint.url)}
                          </Link>
                          {endpoint.description ? (
                            <span className="sub">{endpoint.description}</span>
                          ) : null}
                        </span>
                      </Td>
                      <Td label={w("events")}>
                        <span className="mono">
                          {endpoint.events.includes("*")
                            ? w("allEvents")
                            : endpoint.events.join(", ")}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap" label={w("lastDelivery")}>
                        {last ? (
                          <>
                            <Time value={last.last_attempt_at ?? last.created_at} />
                            {last.response_status ? ` · HTTP ${last.response_status}` : ""}
                          </>
                        ) : (
                          w("never")
                        )}
                      </Td>
                      <Td label={w("stateCol")}>
                        <span className={BADGE[state]}>
                          <span className="dot" />
                          {w(`state.${state}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        <RowMenu
                          label={t("table.moreFor", { name: shortUrl(endpoint.url) })}
                          items={menu(endpoint)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager
          first={cursor ? withQuery(base, { status }) : null}
          next={next ? withQuery(base, { status, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
