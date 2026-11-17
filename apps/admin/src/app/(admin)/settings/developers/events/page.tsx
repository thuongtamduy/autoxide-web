import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Time } from "@/components/ui/time";
import { DEVTOOLS_READ } from "@/lib/permissions";
import { listRecordEvents, RECORD_KINDS, SAMPLE_RECORD } from "@/sample/devtools";

const BASE = "/settings/developers/events";

// Tab "Event theo bản ghi" (dữ liệu mẫu, chờ bước 52): chọn loại bản ghi và mã, xem các event của
// nó theo thời gian và đã giao cho mọi bên nhận chưa. Core chỉ dự kiến tra theo một bản ghi (không có
// danh sách mọi event gần đây), nên khi chưa chọn bản ghi thì trang giải thích và cho một ví dụ bấm
// được (điền sẵn bản ghi mẫu).
export default async function RecordEventsPage(props: PageProps<"/settings/developers/events">) {
  const gate = await sampleGate(DEVTOOLS_READ);
  if (gate) return gate;
  const t = await getTranslations("settings.developers");
  const params = await props.searchParams;
  const kind = RECORD_KINDS.find((k) => k === params.kind) ?? SAMPLE_RECORD.kind;
  const record = typeof params.id === "string" ? params.id.trim() : "";
  const { data } = record ? await listRecordEvents(kind, record) : { data: [] };
  const example = `${BASE}?${new URLSearchParams({ kind: SAMPLE_RECORD.kind, id: SAMPLE_RECORD.id })}`;
  const exampleLink = (
    <Link className="btn pri" href={example}>
      {t("tryExample", { id: SAMPLE_RECORD.id })}
    </Link>
  );
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="ev-h">
        <div className="block-head">
          <h2 id="ev-h" className="h2">
            {t("events")}
          </h2>
          <SampleBadge step="52" endpoint="GET /api/v1/kernel/records/{kind}/{id}/events" />
        </div>
        <form method="get" action={BASE} className="filters">
          <label className="fld">
            <span className="lab">{t("kind")}</span>
            <select className="inp mono" name="kind" defaultValue={kind}>
              {RECORD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="fld grow">
            <span className="lab">{t("recordId")}</span>
            <input
              className="inp mono"
              name="id"
              defaultValue={record}
              placeholder={SAMPLE_RECORD.id}
            />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn pri">
              {t("show")}
            </button>
          </div>
        </form>
        {!record ? (
          <div className="card">
            <EmptyState icon="pulse" title={t("eventsEmptyTitle")} actions={exampleLink}>
              {t("eventsEmptyText")}
            </EmptyState>
          </div>
        ) : data.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="search"
              title={t("noEvents")}
              actions={
                <>
                  {exampleLink}
                  <Link className="btn" href={BASE}>
                    {t("clearRecord")}
                  </Link>
                </>
              }
            >
              {t("noEventsText", { kind, id: record })}
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="fhint">
              {t("eventsFor", { count: data.length, kind, id: record })}{" "}
              <Link href={BASE}>{t("clearRecord")}</Link>
            </p>
            <div className="card">
              <ol className="se-events">
                {data.map((event) => (
                  <li
                    key={event.id}
                    className={event.delivered ? "se-event" : "se-event undelivered"}
                  >
                    <b className="mono se-event-name">{event.name}</b>
                    <span className={event.delivered ? "badge b-ok" : "badge b-warn"}>
                      {event.delivered ? t("delivered") : t("undelivered")}
                    </span>
                    <span className="se-event-meta">
                      <Time value={event.occurred_at} /> · {event.summary}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
