import { getLocale, getTranslations } from "next-intl/server";
import { DisputeBadge, DisputeThread, DueIn } from "@/components/market/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatMoney } from "@/lib/format";
import { sellerContext } from "@/lib/seller";
import { listDisputes } from "@/sample/market";
import { agreeRefundAction, replyDisputeAction } from "../../actions";

// Tranh chấp của người bán: trả lời kèm bằng chứng trong hạn, hay đồng ý hoàn. Quá hạn thì sàn phân
// xử. Đồng ý hoàn không đảo được: đối tác hoàn cho người mua, trừ vào phần của người bán.
export default async function SellerDisputes() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller.disputes"),
    getTranslations("market"),
    getLocale(),
  ]);
  const { data } = await listDisputes({ seller: ctx.seller.org_id });
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const open = data.filter((d) => d.status === "open");
  const rest = data.filter((d) => d.status !== "open");
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sl-answer-h">
        <h2 id="sl-answer-h" className="h2">
          {t("needsAnswer")}
        </h2>
        {open.length === 0 ? (
          <p className="note">{t("none")}</p>
        ) : (
          <ul className="mk-cards">
            {open.map((d) => (
              <li key={d.id} className="card mk-card">
                <div className="mk-card-head">
                  <b>
                    {d.number} · {tm("disputes.order", { number: d.order_number })} ·{" "}
                    {tm(`disputeReason.${d.reason_code}`)}
                  </b>
                  <DueIn until={d.seller_due_at} />
                </div>
                <p>
                  {t("claim", { amount: money(d.claim.amount) })} {t("deadline")}
                </p>
                <DisputeThread d={d} />
                <div className="row-acts start">
                  <FormDialog
                    action={replyDisputeAction}
                    label={t("reply")}
                    title={t("replyTitle", { number: d.number })}
                    intro={t("replyIntro")}
                    submit={t("replySubmit")}
                    done={t("replied")}
                    triggerClass="btn sm pri"
                    fields={[
                      { kind: "hidden", name: "id", value: d.id },
                      {
                        kind: "textarea",
                        name: "body",
                        label: t("replyBody"),
                        hint: t("replyHint"),
                      },
                    ]}
                  />
                  <ConfirmAction
                    action={agreeRefundAction}
                    id={d.id}
                    label={t("agree")}
                    title={t("agreeTitle", { amount: money(d.claim.amount) })}
                    points={[t("agreePoint1"), t("agreePoint2"), t("agreePoint3")]}
                    submit={t("agreeSubmit")}
                    done={t("agreed")}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {rest.length > 0 ? (
        <section className="block" aria-labelledby="sl-past-h">
          <h2 id="sl-past-h" className="h2">
            {t("others")}
          </h2>
          <ul className="mk-cards">
            {rest.map((d) => (
              <li key={d.id} className="card mk-card">
                <div className="mk-card-head">
                  <b>
                    {d.number} · {tm("disputes.order", { number: d.order_number })}
                  </b>
                  <DisputeBadge status={d.status} />
                </div>
                <details className="cp-trail">
                  <summary>{t("thread")}</summary>
                  <DisputeThread d={d} />
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
