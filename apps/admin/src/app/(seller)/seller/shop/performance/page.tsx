import { getLocale, getTranslations } from "next-intl/server";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { percentFromBp } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { sellerPerformance } from "@/sample/market";
import { appealAction } from "../../actions";

// Điểm vi phạm: chỉ số 90 ngày, điểm còn hiệu lực, chế tài; mỗi chế tài khiếu nại được một lần.
export default async function SellerPerformance() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller.performance"),
    getTranslations("market"),
    getLocale(),
  ]);
  const { data } = await sellerPerformance(ctx.seller.org_id);
  const m = data.metrics;
  return (
    <div className="mk-two">
      <section className="block card cp-pad" aria-labelledby="sl-metrics-h">
        <h2 id="sl-metrics-h" className="h2">
          {t("metrics")}
        </h2>
        {m ? (
          <div className="meters">
            <div className="meter">
              <div className="meter-head">
                <span>{t("onTime")}</span>
                <b>{percentFromBp(m.on_time_bp, locale)}</b>
              </div>
              <progress
                className="bar"
                max={10_000}
                value={m.on_time_bp}
                aria-label={t("onTime")}
              />
              <span className="fhint">{t("onTimeGoal")}</span>
            </div>
            <div className="meter">
              <div className="meter-head">
                <span>{t("cancel")}</span>
                <b>{percentFromBp(m.seller_cancel_bp, locale)}</b>
              </div>
              <progress
                className="bar"
                max={500}
                value={m.seller_cancel_bp}
                aria-label={t("cancel")}
              />
              <span className="fhint">{t("cancelGoal")}</span>
            </div>
            <div className="meter">
              <div className="meter-head">
                <span>{t("lost")}</span>
                <b>{t("lostCount", { count: m.disputes_lost })}</b>
              </div>
            </div>
          </div>
        ) : (
          <p className="empty">{t("noMetrics")}</p>
        )}
      </section>
      <section className="block" aria-labelledby="sl-points-h">
        <p className={data.points > 0 ? "note warn" : "note"}>
          <b id="sl-points-h">{t("points", { points: data.points })}</b> {t("pointsText")}
        </p>
        {data.penalties.length > 0 ? (
          <ul className="mk-cards">
            {data.penalties.map((p) => (
              <li key={p.id} className="card mk-card">
                <div className="mk-card-head">
                  <b>
                    {tm(`penaltyRule.${p.rule_code}`)} · {t("pointsShort", { points: p.points })}
                  </b>
                  <span className="badge b-warn">{tm(`sanction.${p.sanction}`)}</span>
                </div>
                <p>{p.reason}</p>
                <p className="fhint">
                  {t("expires")} <Time value={p.expires_at} date />
                </p>
                {p.appealed ? (
                  <p className="fhint">{t("appealed", { reason: p.appeal_reason ?? "" })}</p>
                ) : (
                  <div className="row-acts start">
                    <FormDialog
                      action={appealAction}
                      label={t("appeal")}
                      title={t("appealTitle")}
                      intro={t("appealIntro")}
                      submit={t("appealSubmit")}
                      done={t("appealDone")}
                      fields={[
                        { kind: "hidden", name: "id", value: p.id },
                        {
                          kind: "textarea",
                          name: "reason",
                          label: t("appealReason"),
                          hint: t("appealHint"),
                        },
                      ]}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
