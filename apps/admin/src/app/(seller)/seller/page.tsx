import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Basis } from "@/components/compliance/common";
import { Kpis, Requirements } from "@/components/market/common";
import { SellerHead } from "@/components/market/seller";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatCount, formatMoney } from "@/lib/format";
import { SELLER_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { ruleAt } from "@/sample/compliance-rules";
import { listDisputes, moneyStats, sellerOrderStats } from "@/sample/market";
import { acceptDocumentAction, submitDocumentAction, submitForReviewAction } from "./actions";

// Tổng quan của Trung tâm người bán: các bước để được bán (Luật TMĐT 122/2025, Điều 17: xác thực người
// bán trước khi cho bán). Mỗi bước do một phần riêng của hệ thống kiểm — định danh và văn bản ở Tuân
// thủ, giấy tờ ngành hàng và duyệt hồ sơ ở sàn — nên người bán biết chính xác còn thiếu gì.
export default async function SellerHome() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller"),
    getTranslations("market"),
    getLocale(),
  ]);
  const s = ctx.seller;
  const [{ data: stats }, { data: disputes }, { data: sales }] = await Promise.all([
    moneyStats(s.org_id),
    listDisputes({ seller: s.org_id, status: "open" }),
    sellerOrderStats(s.org_id),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const docNames = (types: string) =>
    types
      .split(",")
      .filter(Boolean)
      .map((type) => tm(`docType.${type}`))
      .join(", ");
  const missingDocs = (
    s.gate.requirements.find((r) => r.key === "documents")?.params.documents ?? ""
  )
    .split(",")
    .filter(Boolean);
  const accept = (kind: "platform_rules" | "seller_agreement") => {
    const req = s.gate.requirements.find((r) => r.key === kind);
    const title = req?.params.title ?? "";
    const version = req?.params.version ?? "";
    return (
      <ConfirmAction
        action={acceptDocumentAction}
        id={kind}
        label={t("steps.accept")}
        title={t("steps.acceptTitle", { title, version })}
        points={[t("steps.acceptPoint1", { title, version }), t("steps.acceptPoint2")]}
        submit={t("steps.acceptSubmit")}
        done={t("steps.accepted", { title })}
        danger={false}
      />
    );
  };
  const submittable = s.status === "pending_verification" || s.status === "draft";
  const done = s.gate.requirements.filter((r) => r.ok).length;
  const total = s.gate.requirements.length;
  return (
    <div className="page mk-page">
      <SellerHead title={t("home.title")} description={t("home.description")} add />
      <div className="blocks">
        <p className={s.gate.can_sell ? "note" : "note warn"}>
          <span className={SELLER_BADGE[s.status]}>
            <span className="dot" />
            {tm(`sellerStatus.${s.status}`)}
          </span>{" "}
          <b>{t(`state.${s.gate.can_sell ? "selling" : s.status}.strong`)}</b>{" "}
          {s.status_reason && !s.gate.can_sell ? `${tm(`reason.${s.status_reason}`)}. ` : ""}
          {t(`state.${s.gate.can_sell ? "selling" : s.status}.text`)}
          {s.status_note ? ` ${t("state.note", { note: s.status_note })}` : ""}
        </p>
        <Kpis
          label={t("home.sales")}
          items={[
            {
              label: t("home.kpiToShip"),
              value: formatCount(sales.by_status.paid, locale),
              sub: t("home.kpiToShipSub"),
            },
            {
              label: t("home.kpiRevenue"),
              value: money(sales.revenue_7d.amount),
              sub: t("home.kpiRevenueSub", { count: sales.orders_7d }),
            },
            {
              label: t("home.kpiShipping"),
              value: formatCount(sales.by_status.shipping, locale),
              sub: t("home.kpiShippingSub"),
            },
          ]}
        />
        {sales.by_status.paid > 0 ? (
          <p className="note mk-next">
            <span>{t("home.toShipNote", { count: sales.by_status.paid })}</span>
            <Link className="btn sm pri" href="/seller/orders?status=paid">
              {t("home.toShipOpen")}
            </Link>
          </p>
        ) : null}
        <Kpis
          label={t("home.kpis")}
          items={[
            {
              label: t("money.kpiHeld"),
              value: money(stats.held.amount),
              sub: t("money.kpiHeldSub", { count: stats.held_orders }),
            },
            {
              label: t("money.kpiNext"),
              value: money(stats.building.amount),
              sub: t("money.kpiNextSub"),
            },
            {
              label: t("home.kpiDisputes"),
              value: formatCount(disputes.length, locale),
              sub: t("home.kpiDisputesSub"),
            },
          ]}
        />
        <section className="block card cp-pad" aria-labelledby="sl-steps-h">
          <div className="block-head">
            <h2 id="sl-steps-h" className="h2">
              {t("steps.title")}
            </h2>
            <span className={done === total ? "badge b-ok" : "badge b-warn"}>
              <span className="dot" />
              {t("steps.progress", { done, total })}
            </span>
          </div>
          <p className="fhint">{t("steps.about")}</p>
          <Requirements
            items={s.gate.requirements}
            docNames={docNames}
            explain={(item) =>
              item.key === "kyc" && item.state !== "verified" ? t(`steps.kyc.${item.state}`) : null
            }
            fix={{
              platform_rules: accept("platform_rules"),
              seller_agreement: accept("seller_agreement"),
              documents:
                missingDocs.length > 0 ? (
                  <FormDialog
                    action={submitDocumentAction}
                    label={t("steps.sendDocument")}
                    title={t("steps.documentTitle")}
                    intro={t("steps.documentIntro")}
                    submit={t("steps.documentSubmit")}
                    done={t("steps.documentSent")}
                    fields={[
                      {
                        kind: "select",
                        name: "doc_type",
                        label: t("steps.documentType"),
                        options: missingDocs.map((d) => ({ value: d, label: tm(`docType.${d}`) })),
                      },
                      {
                        kind: "text",
                        name: "number",
                        label: t("steps.documentNumber"),
                        mono: true,
                      },
                      {
                        kind: "date",
                        name: "valid_until",
                        label: t("steps.documentUntil"),
                        hint: t("steps.documentUntilHint"),
                      },
                    ]}
                  />
                ) : null,
              payout_account: (
                <Link className="btn sm" href="/seller/shop#sl-payout-h">
                  {t("steps.setAccount")}
                </Link>
              ),
              // Bước cuối: gửi hồ sơ ngay trên dòng của bước duyệt (đang chờ sàn thì không có nút).
              review: submittable ? (
                <ConfirmAction
                  action={submitForReviewAction}
                  id={s.org_id}
                  label={t("steps.submit")}
                  title={t("steps.submitTitle")}
                  points={[t("steps.submitPoint1"), t("steps.submitPoint2")]}
                  submit={t("steps.submit")}
                  done={t("steps.submitted")}
                  danger={false}
                />
              ) : null,
            }}
          />
          <Basis rule={ruleAt("kyc.required_activities")} lead={t("steps.basis")} />
        </section>
      </div>
    </div>
  );
}
