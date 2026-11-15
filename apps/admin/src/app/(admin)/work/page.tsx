import { getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { TaskList } from "@/components/work/task-list";
import { sampleDataEnabled } from "@/sample";
import type { ItemState } from "@/work/registry";
import { assignCandidates, workRows } from "@/work/server";
import { WORK_SOURCES } from "@/work/sources";

const STATES: readonly ItemState[] = ["open", "assigned", "snoozed"];

function one(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return typeof value === "string" ? value : "";
}

// Tab "Việc cần làm": cùng hộp việc với trang Tổng quan, đủ mọi việc. Lọc theo trạng thái của bạn
// (đang chờ, đã giao, đã hoãn) và theo phân hệ; bộ lọc nằm trên địa chỉ (`?state=&area=`).
export default async function WorkPage(props: PageProps<"/work">) {
  const [t, nav, params] = await Promise.all([
    getTranslations("work"),
    getTranslations("nav"),
    props.searchParams,
  ]);
  const sample = sampleDataEnabled();
  const [{ rows, incomplete, now }, candidates] = await Promise.all([
    workRows(),
    sample ? assignCandidates() : Promise.resolve([]),
  ]);
  const state = STATES.find((s) => s === one(params, "state")) ?? null;
  const groupOf = (source: string) => WORK_SOURCES.find((s) => s.id === source)?.group ?? "";
  const areas = [...new Set(rows.map((row) => groupOf(row.source)))];
  const area = areas.find((a) => a === one(params, "area")) ?? null;
  const href = (next: { state?: string | null; area?: string | null }) => {
    const query = new URLSearchParams();
    const s = next.state === undefined ? state : next.state;
    const a = next.area === undefined ? area : next.area;
    if (s) query.set("state", s);
    if (a) query.set("area", a);
    const text = query.toString();
    return text ? `/work?${text}` : "/work";
  };
  const inArea = rows.filter((row) => !area || groupOf(row.source) === area);
  const shown = inArea.filter((row) => !state || row.state === state);
  const names = incomplete.map((id) =>
    t.has(`sources.${id.replace(".", "_")}`) ? t(`sources.${id.replace(".", "_")}`) : id,
  );
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="wk-box-h">
        <div className="block-head">
          <h2 id="wk-box-h" className="h2">
            {t("box.title")}
          </h2>
          {sample ? (
            <SampleBadge step="51" endpoint="POST /api/v1/me/work/{key}/snooze, …/assign" />
          ) : null}
        </div>
        <p className="fhint">{t("box.about")}</p>
        {incomplete.length > 0 ? (
          <p className="note warn" role="status">
            {t("box.incomplete", { count: incomplete.length, names: names.join(", ") })}
          </p>
        ) : null}
        <Chips
          label={t("box.filter")}
          chips={[
            { href: href({ state: null }), label: t("box.all"), on: !state, count: inArea.length },
            ...STATES.map((s) => ({
              href: href({ state: s }),
              label: t(`box.${s}`),
              on: state === s,
              count: inArea.filter((row) => row.state === s).length,
            })),
          ]}
        />
        {areas.length > 1 ? (
          <Chips
            label={t("box.areaFilter")}
            chips={[
              { href: href({ area: null }), label: t("box.areaAll"), on: !area },
              ...areas.map((a) => ({
                href: href({ area: a }),
                label: nav(`groups.${a}`),
                on: area === a,
                count: rows.filter((row) => groupOf(row.source) === a).length,
              })),
            ]}
          />
        ) : null}
        <div className="card wk-card">
          {shown.length === 0 ? (
            <p className="empty">{rows.length === 0 ? t("box.empty") : t("box.emptyFilter")}</p>
          ) : (
            <TaskList rows={shown} now={now} candidates={candidates} actions={sample} />
          )}
        </div>
        {sample ? <p className="fhint">{t("box.sampleNote")}</p> : null}
      </section>
    </div>
  );
}
