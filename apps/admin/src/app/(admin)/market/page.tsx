import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { startPreviewAction } from "@/app/(seller)/seller/actions";
import { Basis } from "@/components/compliance/common";
import { Chips, Forbidden } from "@/components/engage/common";
import { ComplianceLink, History, Kpis, KycLine, Requirements } from "@/components/market/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount } from "@/lib/format";
import {
  MARKETPLACE_SELLERS_MANAGE,
  MARKETPLACE_SELLERS_READ,
  ratingText,
  SELLER_BADGE,
} from "@/lib/market";
import { KYC_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { ruleAt } from "@/sample/compliance-rules";
import {
  AUTO_REASONS,
  listInvitations,
  listSellers,
  PENALTY_RULES,
  SANCTIONS,
  type SellerStatus,
  type SellerView,
  sellerCounts,
} from "@/sample/market";
import {
  addPenaltyAction,
  approveDocumentAction,
  approveSellerAction,
  reinstateSellerAction,
  rejectDocumentAction,
  rejectSellerAction,
  resuspendSellerAction,
  suspendSellerAction,
  terminateSellerAction,
} from "./actions";
import { param } from "./shared";

const FILTERS: SellerStatus[] = [
  "pending_review",
  "pending_verification",
  "active",
  "suspended",
  "terminated",
];

// Tab "Người bán": duyệt hồ sơ người bán. Người bán chỉ được bán khi đang bán VÀ định danh còn hạn
// VÀ đã chấp nhận bản hiện hành của quy chế sàn và hợp đồng người bán (Luật TMĐT 122/2025, Điều 17).
// Định danh duyệt ở màn Tuân thủ — ở đây chỉ đọc kết quả và dẫn sang đó.
export default async function SellersTab(props: PageProps<"/market">) {
  if (!(await can(MARKETPLACE_SELLERS_READ))) {
    return <Forbidden permission={MARKETPLACE_SELLERS_READ} />;
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const status = FILTERS.find((s) => s === param(params, "status"));
  const open = param(params, "open");
  const [{ data: sellers }, counts, { data: invitations }, manage, kycReader] = await Promise.all([
    listSellers(status ? { status } : {}),
    sellerCounts(),
    listInvitations(),
    can(MARKETPLACE_SELLERS_MANAGE),
    can(KYC_READ),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/market?${query}` : "/market";
  };
  const docNames = (types: string) =>
    types
      .split(",")
      .filter(Boolean)
      .map((type) => t(`docType.${type}`))
      .join(", ");
  return (
    <div className="blocks">
      <Kpis
        label={t("sellers.kpis")}
        items={[
          {
            label: t("sellers.kpiActive"),
            value: formatCount(counts.active, locale),
            sub: t("sellers.kpiActiveSub"),
          },
          {
            label: t("sellers.kpiReview"),
            value: formatCount(counts.pending_review, locale),
            sub: t("sellers.kpiReviewSub"),
          },
          {
            label: t("sellers.kpiVerify"),
            value: formatCount(counts.pending_verification, locale),
            sub: t("sellers.kpiVerifySub"),
          },
          {
            label: t("sellers.kpiSuspended"),
            value: formatCount(counts.suspended, locale),
            sub: t("sellers.kpiSuspendedSub"),
          },
        ]}
      />
      <Basis rule={ruleAt("kyc.required_activities")} lead={t("sellers.gateNote")} />

      <section className="block" aria-labelledby="mk-sellers-h">
        <h2 id="mk-sellers-h" className="h2">
          {t("sellers.title")}
        </h2>
        <p className="fhint">{t("sellers.about")}</p>
        <Chips
          label={t("sellers.filter")}
          chips={[
            {
              href: href({ status: null, open: null }),
              label: t("all"),
              on: !status,
              count: total,
            },
            ...FILTERS.map((s) => ({
              href: href({ status: s, open: null }),
              label: t(`sellerStatus.${s}`),
              on: status === s,
              count: counts[s],
            })),
          ]}
        />
        <div className="card tcard">
          {sellers.length === 0 ? (
            <p className="empty">{t("sellers.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("sellers.seller")}</Th>
                  <Th>{t("sellers.category")}</Th>
                  <Th>{t("sellers.rating")}</Th>
                  <Th className="text-right">{t("sellers.products")}</Th>
                  <Th>{t("sellers.kyc")}</Th>
                  <Th>{t("sellers.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => {
                  const isOpen = open === s.org_id;
                  return [
                    <tr key={s.org_id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen
                                ? href({ open: null })
                                : `${href({ open: s.org_id })}#mk-sellers-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {s.display_name}
                          </Link>
                          <span className="sub">{t(`sellerType.${s.seller_type}`)}</span>
                        </span>
                      </Td>
                      <Td label={t("sellers.category")}>{s.category_name}</Td>
                      <Td label={t("sellers.rating")}>
                        {s.rating
                          ? `${ratingText(s.rating.average_x10, locale)} ★`
                          : t("sellers.noRating")}
                      </Td>
                      <Td label={t("sellers.products")} className="text-right num">
                        {formatCount(s.product_count, locale)}
                      </Td>
                      <Td label={t("sellers.kyc")}>
                        <KycLine kyc={s.gate.kyc} />
                      </Td>
                      <Td label={t("sellers.state")}>
                        <span className="cell2">
                          <span className={SELLER_BADGE[s.status]}>
                            <span className="dot" />
                            {t(`sellerStatus.${s.status}`)}
                          </span>
                          {s.status_reason && s.status !== "pending_verification" ? (
                            <span className="sub">{t(`reason.${s.status_reason}`)}</span>
                          ) : null}
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${s.org_id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <SellerDetail
                            seller={s}
                            manage={manage}
                            kycReader={kycReader}
                            docNames={docNames}
                          />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      {invitations.length > 0 ? (
        <section className="block" aria-labelledby="mk-invites-h">
          <h2 id="mk-invites-h" className="h2">
            {t("invite.sent")}
          </h2>
          <ul className="cat-lines">
            {invitations.map((i) => (
              <li key={i.id}>
                <span className="cell2">
                  <span>{i.email}</span>
                  <span className="sub">{t(`sellerType.${i.seller_type}`)}</span>
                </span>
                <span className="sub">
                  <Time value={i.created_at} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function SellerDetail({
  seller: s,
  manage,
  kycReader,
  docNames,
}: {
  seller: SellerView;
  manage: boolean;
  kycReader: boolean;
  docNames: (types: string) => string;
}) {
  const t = await getTranslations("market");
  const auto = s.status_reason !== null && AUTO_REASONS.includes(s.status_reason);
  const reasonField = {
    kind: "textarea" as const,
    name: "reason",
    label: t("sellers.reason"),
    hint: t("sellers.reasonHint"),
  };
  return (
    <div className="cat-detail">
      <h3 className="h2">{s.display_name}</h3>
      <p className="fhint">
        {t(`sellerType.${s.seller_type}`)} · {t("sellers.joined")} <Time value={s.joined_at} date />{" "}
        · <span className="mono">/{s.slug}</span>
      </p>
      {s.status_note || s.status_reason ? (
        <p className={s.status === "suspended" || s.status === "terminated" ? "note warn" : "note"}>
          <b>{s.status_reason ? `${t(`reason.${s.status_reason}`)}.` : ""}</b>
          {s.status_note ? ` ${s.status_note}` : ""}
          {auto ? ` ${t("sellers.autoLift")}` : ""}
        </p>
      ) : null}
      <dl className="eg-facts">
        <div>
          <dt>{t("sellers.fulfillment")}</dt>
          <dd>{t(`fulfillment.${s.fulfillment}`)}</dd>
        </div>
        <div>
          <dt>{t("sellers.payoutAccount")}</dt>
          <dd>
            {s.payout_account
              ? t("sellers.accountMasked", {
                  bank: s.payout_account.bank_name,
                  last4: s.payout_account.number_last4,
                })
              : t("sellers.accountMissing")}
          </dd>
        </div>
        <div>
          <dt>{t("sellers.points")}</dt>
          <dd>{s.penalty_points}</dd>
        </div>
        <div>
          <dt>{t("sellers.pickup")}</dt>
          <dd>{s.pickup_address}</dd>
        </div>
      </dl>
      <h4 className="mk-h3">{s.gate.can_sell ? t("sellers.canSell") : t("sellers.cannotSell")}</h4>
      <Requirements
        items={s.gate.requirements}
        docNames={docNames}
        fix={
          kycReader
            ? { kyc: <ComplianceLink href="/compliance/kyc" label={t("sellers.openKyc")} /> }
            : {}
        }
      />
      <p className="fhint">{t("sellers.gateFoot")}</p>
      {s.documents.length > 0 ? (
        <>
          <h4 className="mk-h3">{t("sellers.documents")}</h4>
          <ul className="cat-lines">
            {s.documents.map((d) => (
              <li key={d.id}>
                <span className="cell2">
                  <span>
                    {t(`docType.${d.doc_type}`)} · <span className="mono">{d.number}</span>
                  </span>
                  <span className="sub">
                    {t(`docStatus.${d.status}`)}
                    {d.review_note ? ` · ${d.review_note}` : ""}
                  </span>
                </span>
                {manage && d.status === "submitted" ? (
                  <span className="row-acts">
                    <ConfirmAction
                      action={approveDocumentAction}
                      id={d.id}
                      label={t("sellers.docApprove")}
                      title={t("sellers.docApproveTitle", { name: s.display_name })}
                      points={[t("sellers.docApprovePoint1"), t("sellers.docApprovePoint2")]}
                      submit={t("sellers.docApprove")}
                      done={t("sellers.docApproved")}
                      danger={false}
                    />
                    <FormDialog
                      action={rejectDocumentAction}
                      label={t("sellers.docReject")}
                      title={t("sellers.docRejectTitle")}
                      submit={t("sellers.docReject")}
                      done={t("sellers.docRejected")}
                      fields={[
                        { kind: "hidden", name: "id", value: d.id },
                        {
                          kind: "textarea",
                          name: "note",
                          label: t("sellers.reason"),
                          hint: t("sellers.reasonHint"),
                        },
                      ]}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <details className="cp-trail">
        <summary>{t("sellers.history")}</summary>
        <History events={s.history} />
      </details>
      <div className="row-acts start">
        {manage && s.status === "pending_review" ? (
          <>
            <ConfirmAction
              action={approveSellerAction}
              id={s.org_id}
              label={t("sellers.approve")}
              title={t("sellers.approveTitle", { name: s.display_name })}
              points={[
                t("sellers.approvePoint1"),
                t("sellers.approvePoint2"),
                t("sellers.approvePoint3"),
              ]}
              submit={t("sellers.approve")}
              done={t("sellers.approved", { name: s.display_name })}
              danger={false}
            />
            <FormDialog
              action={rejectSellerAction}
              label={t("sellers.reject")}
              title={t("sellers.rejectTitle", { name: s.display_name })}
              intro={t("sellers.rejectIntro")}
              submit={t("sellers.reject")}
              done={t("sellers.rejected")}
              fields={[{ kind: "hidden", name: "id", value: s.org_id }, reasonField]}
            />
          </>
        ) : null}
        {manage && s.status === "active" ? (
          <FormDialog
            action={suspendSellerAction}
            label={t("sellers.suspend")}
            title={t("sellers.suspendTitle", { name: s.display_name })}
            points={[
              t("sellers.suspendPoint1"),
              t("sellers.suspendPoint2"),
              t("sellers.suspendPoint3"),
            ]}
            submit={t("sellers.suspend")}
            done={t("sellers.suspended", { name: s.display_name })}
            danger
            triggerClass="btn sm danger"
            undoAction={reinstateSellerAction}
            undoLabel={t("undo")}
            undoDone={t("undone")}
            fields={[{ kind: "hidden", name: "id", value: s.org_id }, reasonField]}
          />
        ) : null}
        {manage && s.status === "suspended" && !auto ? (
          <FormDialog
            action={reinstateSellerAction}
            label={t("sellers.reinstate")}
            title={t("sellers.reinstateTitle", { name: s.display_name })}
            intro={t("sellers.reinstateIntro")}
            submit={t("sellers.reinstate")}
            done={t("sellers.reinstated", { name: s.display_name })}
            undoAction={resuspendSellerAction}
            undoLabel={t("undo")}
            undoDone={t("undone")}
            fields={[
              { kind: "hidden", name: "id", value: s.org_id },
              { kind: "hidden", name: "reason", value: s.status_note ?? "" },
            ]}
          />
        ) : null}
        {manage && (s.status === "active" || s.status === "suspended") ? (
          <FormDialog
            action={addPenaltyAction}
            label={t("sellers.penalty")}
            title={t("sellers.penaltyTitle", { name: s.display_name })}
            intro={t("sellers.penaltyIntro")}
            submit={t("sellers.penaltySubmit")}
            done={t("sellers.penaltyDone")}
            fields={[
              { kind: "hidden", name: "id", value: s.org_id },
              {
                kind: "select",
                name: "rule_code",
                label: t("sellers.penaltyRule"),
                options: PENALTY_RULES.map((r) => ({ value: r, label: t(`penaltyRule.${r}`) })),
              },
              {
                kind: "number",
                name: "points",
                label: t("sellers.penaltyPoints"),
                defaultValue: "1",
              },
              {
                kind: "select",
                name: "sanction",
                label: t("sellers.penaltySanction"),
                options: SANCTIONS.map((r) => ({ value: r, label: t(`sanction.${r}`) })),
              },
              reasonField,
            ]}
          />
        ) : null}
        {manage && s.status !== "terminated" ? (
          <FormDialog
            action={terminateSellerAction}
            label={t("sellers.terminate")}
            title={t("sellers.terminateTitle", { name: s.display_name })}
            points={[
              t("sellers.terminatePoint1"),
              t("sellers.terminatePoint2"),
              t("sellers.terminatePoint3"),
            ]}
            submit={t("sellers.terminate")}
            done={t("sellers.terminated", { name: s.display_name })}
            danger
            triggerClass="btn sm danger"
            fields={[
              { kind: "hidden", name: "id", value: s.org_id },
              reasonField,
              { kind: "check", name: "acknowledged", label: t("sellers.terminateAck") },
            ]}
          />
        ) : null}
        <form action={startPreviewAction}>
          <input type="hidden" name="org_id" value={s.org_id} />
          <button type="submit" className="btn sm">
            {t("sellers.previewAs")}
          </button>
        </form>
      </div>
    </div>
  );
}
