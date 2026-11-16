import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { Time } from "@/components/ui/time";
import { DEVTOOLS_READ } from "@/lib/permissions";
import { listRecordEvents, RECORD_KINDS, SAMPLE_RECORD } from "@/sample/devtools";

// Tab "Event theo bản ghi" (dữ liệu mẫu, chờ bước 52): chọn loại bản ghi và mã, xem các event của
// nó theo thời gian và đã giao cho mọi bên nhận chưa.
export default async function RecordEventsPage(props: PageProps<"/settings/developers/events">) {
  const gate = await sampleGate(DEVTOOLS_READ);
  if (gate) return gate;
  const t = await getTranslations("settings.developers");
  const params = await props.searchParams;
  const kind = RECORD_KINDS.find((k) => k === params.kind) ?? SAMPLE_RECORD.kind;
  const record = typeof params.id === "string" ? params.id.trim() : "";
  const { data } = record ? await listRecordEvents(kind, record) : { data: [] };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="ev-h">
        <div className="block-head">
          <h2 id="ev-h" className="h2">
            {t("events")}
          </h2>
          <SampleBadge step="52" endpoint="GET /api/v1/kernel/records/{kind}/{id}/events" />
        </div>
        <p className="fhint">{t("eventsAbout", { example: SAMPLE_RECORD.id })}</p>
        <form method="get" action="/settings/developers/events" className="filters">
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
        {record ? (
          <div className="card padded">
            {data.length === 0 ? (
              <p className="empty">{t("noEvents")}</p>
            ) : (
              <ol className="timeline">
                {data.map((event) => (
                  <li key={event.id}>
                    <b className="mono">{event.name}</b>
                    <span>{event.summary}</span>
                    <span className="sub">
                      <Time value={event.occurred_at} /> ·{" "}
                      {event.delivered ? t("delivered") : t("undelivered")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
