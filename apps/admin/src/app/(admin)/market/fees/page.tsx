import { getLocale, getTranslations } from "next-intl/server";
import { Day } from "@/components/compliance/common";
import { Forbidden } from "@/components/engage/common";
import { FeePreviewForm } from "@/components/market/forms";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { FEE_BADGE, MARKETPLACE_FEES_MANAGE, percentFromBp } from "@/lib/market";
import { can } from "@/lib/viewer";
import { CATEGORY_ID } from "@/sample/catalog";
import { FEE_KINDS, listFeeRules, SELLER_TYPES } from "@/sample/market";
import { listWithholdingRates, vietnamDay } from "@/sample/tax";
import { addFeeRuleAction, cancelFeeRuleAction, previewFeeAction } from "../actions";
import { categoryOptions } from "../shared";

// Tab "Phí sàn": phí là dữ liệu có ngày hiệu lực, chỉ thêm. Muốn đổi thì thêm dòng mới từ một ngày
// sau hôm nay; dòng cũ cùng loại và phạm vi tự đóng vào ngày trước đó, nên mọi đơn cũ vẫn tính đúng
// phí lúc đặt. Phí sàn là dịch vụ của sàn nên mức đã gồm thuế GTGT của phí.
export default async function FeesTab() {
  if (!(await can(MARKETPLACE_FEES_MANAGE))) {
    return <Forbidden permission={MARKETPLACE_FEES_MANAGE} />;
  }
  const [t, locale] = await Promise.all([getTranslations("market"), getLocale()]);
  const [{ data: rules }, categories, { data: withholding }] = await Promise.all([
    listFeeRules(),
    categoryOptions(locale),
    listWithholdingRates(),
  ]);
  const tomorrow = new Date(Date.parse(`${vietnamDay()}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const types = SELLER_TYPES.map((type) => ({ value: type, label: t(`sellerType.${type}`) }));
  const basis = withholding.find((r) => r.business_line === "goods");
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="mk-fees-h">
        <div className="block-head">
          <h2 id="mk-fees-h" className="h2">
            {t("fees.title")}
          </h2>
          <FormDialog
            action={addFeeRuleAction}
            label={t("fees.add")}
            title={t("fees.addTitle")}
            intro={t("fees.addIntro")}
            points={[t("fees.addPoint1"), t("fees.addPoint2")]}
            submit={t("fees.addSubmit")}
            done={t("fees.added")}
            fields={[
              {
                kind: "select",
                name: "fee_kind",
                label: t("fees.kind"),
                options: FEE_KINDS.filter((k) => k !== "storage").map((k) => ({
                  value: k,
                  label: t(`feeKind.${k}`),
                })),
              },
              {
                kind: "select",
                name: "category_id",
                label: t("fees.appliesTo"),
                options: [{ value: "", label: t("fees.allCategories") }, ...categories],
              },
              {
                kind: "select",
                name: "seller_type",
                label: t("fees.sellerType"),
                options: [{ value: "", label: t("fees.allTypes") }, ...types],
              },
              {
                kind: "text",
                name: "rate",
                label: t("fees.rate"),
                mono: true,
                placeholder: "6",
                hint: t("fees.rateHint"),
              },
              {
                kind: "date",
                name: "effective_from",
                label: t("fees.from"),
                defaultValue: tomorrow,
                hint: t("fees.fromHint"),
              },
            ]}
          />
        </div>
        <p className="fhint">{t("fees.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("fees.kind")}</Th>
                <Th>{t("fees.appliesTo")}</Th>
                <Th className="text-right">{t("fees.level")}</Th>
                <Th>{t("fees.effective")}</Th>
                <Th>{t("fees.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">
                    <b>{t(`feeKind.${r.fee_kind}`)}</b>
                  </Td>
                  <Td label={t("fees.appliesTo")}>
                    <span className="cell2">
                      <span>{r.category_name ?? t("fees.allCategories")}</span>
                      <span className="sub">
                        {r.seller_type ? t(`sellerType.${r.seller_type}`) : t("fees.allTypes")}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("fees.level")} className="text-right num">
                    {r.rate_bp !== null
                      ? t("fees.rateValue", { rate: percentFromBp(r.rate_bp, locale) })
                      : r.fixed
                        ? t(`fees.fixed.${r.unit ?? "order"}`, {
                            amount: formatMoney(r.fixed.amount, r.fixed.currency, locale),
                          })
                        : "—"}
                  </Td>
                  <Td label={t("fees.effective")}>
                    <Day value={r.effective_from} />
                    {r.effective_to ? (
                      <>
                        {" – "}
                        <Day value={r.effective_to} />
                      </>
                    ) : (
                      ` ${t("fees.onwards")}`
                    )}
                  </Td>
                  <Td label={t("fees.state")}>
                    <span className={FEE_BADGE[r.state]}>
                      <span className="dot" />
                      {t(`feeState.${r.state}`)}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {r.state === "scheduled" ? (
                      <ConfirmAction
                        action={cancelFeeRuleAction}
                        id={r.id}
                        label={t("fees.cancel")}
                        title={t("fees.cancelTitle")}
                        points={[t("fees.cancelPoint1"), t("fees.cancelPoint2")]}
                        submit={t("fees.cancel")}
                        done={t("fees.canceled")}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("fees.foot")}</p>
      </section>

      <div className="mk-two">
        <section className="block card cp-pad" aria-labelledby="mk-preview-h">
          <h2 id="mk-preview-h" className="h2">
            {t("fees.preview")}
          </h2>
          <FeePreviewForm
            action={previewFeeAction}
            categories={categories}
            types={types}
            defaults={{
              category_id: CATEGORY_ID.pots,
              price: "690000",
              seller_type: "household",
              date: vietnamDay(),
            }}
            labels={{
              category: t("fees.category"),
              price: t("fees.price"),
              priceHint: t("fees.priceHint"),
              type: t("fees.sellerType"),
              typeHint: t("fees.typeHint"),
              date: t("fees.date"),
              submit: t("fees.previewSubmit"),
              gross: t("money.gross"),
              commission: t("money.commission"),
              feeVat: t("money.feeVatIncluded"),
              vat: t("money.vat"),
              pit: t("money.pit"),
              net: t("money.sellerGets"),
              none: t("fees.noRule"),
            }}
          />
        </section>
        <section className="block" aria-labelledby="mk-withhold-h">
          <p className="note">
            <b id="mk-withhold-h">{t("fees.withholdTitle")}</b> {t("fees.withholdText")}
          </p>
          {basis ? (
            <p className="note cp-basis">
              <b>{t("fees.basis")}</b> {basis.legal_basis}. {t("fees.since")}{" "}
              <Day value={basis.effective_from} />.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
