import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis } from "@/components/compliance/common";
import { SampleBadge } from "@/components/sample-badge";
import { Time } from "@/components/ui/time";
import { AI_SCAN_LIMIT, loadAiEntries } from "@/lib/compliance-server";
import { CASES_READ } from "@/lib/permissions";
import { listAiLabelled, listCases } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

const CASE_BADGE = {
  received: "badge b-warn",
  under_review: "badge b-info",
  awaiting_response: "badge b-violet",
  decided: "badge b-ok",
  closed: "badge b-arch",
  withdrawn: "badge b-arch",
} as const;

// Tab "Báo vi phạm và AI" (tóm tắt): vụ việc đang mở và hạn kế tiếp; nội dung có nhãn AI. Bài viết có
// nhãn AI đọc THẬT từ core (`ai_generated` của `content`); sản phẩm và alt ảnh là dữ liệu mẫu.
export default async function ReportsSummary() {
  const gate = await sampleGate(CASES_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.reports");
  const [{ data: cases }, { data: labelled }, entries] = await Promise.all([
    listCases(),
    listAiLabelled(),
    loadAiEntries(),
  ]);
  const open = cases.filter((c) =>
    ["received", "under_review", "awaiting_response"].includes(c.status),
  );
  const recent = cases.filter((c) => c.status === "decided").slice(0, 2);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-cases-h">
        <div className="block-head">
          <h2 id="cp-cases-h" className="h2">
            {t("cases")}
          </h2>
          <Link className="btn sm" href="/compliance/records/cases">
            {t("openCases")}
          </Link>
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card">
          {[...open, ...recent].map((c) => (
            <div key={c.id} className="item">
              <div className="item-main">
                <span className="item-title">
                  {t(`kinds.${c.kind}`)}: {c.target.title}
                </span>
                <span className="item-meta">
                  <span className="mono">{c.reference}</span>
                  {c.respondent ? ` · ${c.respondent.name}` : ""} ·{" "}
                  {c.restricted ? t("hidden") : t("visible")}
                </span>
              </div>
              {c.status === "decided" ? null : (
                <span className="due">
                  {c.respond_by ? t("respondBy") : t("decideBy")}{" "}
                  <Time value={c.respond_by ?? c.decide_by} />
                </span>
              )}
              <span className={CASE_BADGE[c.status]}>
                <span className="dot" />
                {t(`status.${c.status}`)}
              </span>
            </div>
          ))}
        </div>
        <Basis rule={ruleAt("cases.deadlines")} lead={t("flow")} />
      </section>

      <section className="block" aria-labelledby="cp-ai-h">
        <div className="block-head">
          <h2 id="cp-ai-h" className="h2">
            {t("ai")}
          </h2>
          <Link className="btn sm" href="/compliance/records/ai">
            {t("openAi")}
          </Link>
        </div>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("aiPosts")}</span>
            <span className="kpi-value">{entries ? entries.length : "—"}</span>
            <span className="kpi-sub">
              {entries ? t("aiPostsSub", { limit: AI_SCAN_LIMIT }) : t("aiPostsNone")}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">
              {t("aiOther")}{" "}
              <SampleBadge
                step="mới"
                endpoint="GET /api/v1/catalog/products?ai_label=, GET /api/v1/media?ai_label="
              />
            </span>
            <span className="kpi-value">
              {labelled.filter((a) => a.label !== "removed").length}
            </span>
            <span className="kpi-sub">{t("aiOtherSub")}</span>
          </div>
        </div>
        <Basis rule={ruleAt("ai.labels")} lead={t("aiLaw")} />
      </section>
    </div>
  );
}
