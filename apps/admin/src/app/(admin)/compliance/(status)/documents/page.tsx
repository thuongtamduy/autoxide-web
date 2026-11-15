import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, Day } from "@/components/compliance/common";
import { formatCount } from "@/lib/format";
import { DOCUMENTS_READ } from "@/lib/permissions";
import { currentVersion, documentState, listDocuments } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

const STATE_BADGE = { current: "badge b-ok", scheduled: "badge b-sched", none: "badge b-draft" };

// Tab "Văn bản pháp lý" (tóm tắt): bản nào đang hiệu lực, bản nào chờ, ai chưa chấp nhận. Phát hành
// và xem bằng chứng ở màn Hồ sơ và dữ liệu cá nhân.
export default async function DocumentsSummary() {
  const gate = await sampleGate(DOCUMENTS_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.documents");
  const [{ data: documents }, locale] = await Promise.all([listDocuments(), getLocale()]);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-docs-h">
        <div className="block-head">
          <h2 id="cp-docs-h" className="h2">
            {t("title")}
          </h2>
          <Link className="btn sm" href="/compliance/records/documents">
            {t("manage")}
          </Link>
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card">
          {documents.map((doc) => {
            const state = documentState(doc);
            const current = currentVersion(doc);
            const latest = doc.versions[0];
            const missing =
              current?.requires_reacceptance && doc.audience_total !== null
                ? doc.audience_total - current.accepted_count
                : 0;
            return (
              <div key={doc.id} className="item">
                <div className="item-main">
                  <span className="item-title">{doc.title}</span>
                  <span className="item-meta">
                    {current ? (
                      <>
                        {t("currentVersion", { version: current.version })}{" "}
                        <Day value={current.effective_from} /> ·{" "}
                        {doc.audience_total !== null
                          ? t("acceptedOf", {
                              count: formatCount(current.accepted_count, locale),
                              total: formatCount(doc.audience_total, locale),
                            })
                          : t("accepted", { count: formatCount(current.accepted_count, locale) })}
                      </>
                    ) : (
                      t("noVersion")
                    )}
                    {state === "scheduled" && latest ? (
                      <>
                        {" "}
                        · {t("next", { version: latest.version })}{" "}
                        <Day value={latest.effective_from} />
                      </>
                    ) : null}
                  </span>
                </div>
                <span className={missing > 0 ? "badge b-warn" : STATE_BADGE[state]}>
                  <span className="dot" />
                  {missing > 0 ? t("notAccepted", { count: missing }) : t(`state.${state}`)}
                </span>
              </div>
            );
          })}
        </div>
        <Basis rule={ruleAt("documents.evidence")} lead={t("evidence")} />
      </section>
    </div>
  );
}
