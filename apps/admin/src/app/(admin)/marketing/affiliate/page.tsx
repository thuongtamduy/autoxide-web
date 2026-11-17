import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  approveAction,
  bulkApprovePartners,
  bulkReopenPartners,
  bulkSuspendPartners,
  bulkTerminatePartners,
  reopenAction,
} from "@/app/(admin)/marketing/affiliate/actions";
import { SuspendDialog, TerminateDialog } from "@/components/affiliate/forms";
import { ChangeButtons } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  Kpis,
  KV,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { InlineAction } from "@/components/ui/confirm";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { AFFILIATE_MANAGE } from "@/lib/affiliate";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  gateIssues,
  getProgram,
  listPartners,
  type Partner,
  type PartnerChip,
  type PartnerStatus,
} from "@/sample/affiliate";
import { AFFILIATE_TABS } from "./shared";

const CHIPS: readonly PartnerChip[] = [
  "pending_review",
  "pending_verification",
  "active",
  "suspended",
];
const TONE: Record<PartnerStatus, string> = {
  pending_verification: "b-warn",
  pending_review: "b-violet",
  active: "b-ok",
  suspended: "b-bad",
  terminated: "b-arch",
};

// Tab "Đối tác": người tiếp thị và người livestream. Vòng đời chờ xác thực (danh tính đúng mục đích, SĐT,
// điều khoản) → chờ duyệt → đang hoạt động ↔ tạm khoá → chấm dứt. Mọi việc có tác dụng (tạo link, ghi nhận
// đơn, mở phiên, chi tiền) đều qua một cổng kiểm `PartnerGate` (Luật TMĐT 122/2025, NĐ 147/2024).
// Chọn nhiều để duyệt / tạm khoá / mở lại / chấm dứt (hàm mẫu chỉ có lệnh từng người: lặp, gom lỗi theo
// dòng); "⋯" trên dòng. Không sắp, không phân trang: danh sách mẫu ngắn, lọc theo chip.
export default async function PartnersPage(props: PageProps<"/marketing/affiliate">) {
  if (!(await can(AFFILIATE_TABS.partners))) notFound();
  const [t, tt, locale, params, all, program, manage] = await Promise.all([
    getTranslations("affiliate"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    listPartners(),
    getProgram(),
    can(AFFILIATE_MANAGE),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const base = { chip: chip ?? "" };
  const rows = all.data.filter((p) => !chip || p.status === chip);
  const count = (s: PartnerStatus) => all.data.filter((p) => p.status === s).length;
  const kycText = (p: Partner): string => {
    const issues = gateIssues(p, program.terms_version);
    if (issues.length === 0) {
      const until = [p.kyc.affiliate, p.kyc.livestream]
        .filter((k) => k !== null)
        .map((k) => k?.expires_at.slice(0, 7) ?? "")
        .sort()[0];
      return t("partners.kycOk", { until: until ?? "" });
    }
    return issues.map((i) => t(`gate.${i.replaceAll(".", "_")}`)).join(", ");
  };
  // "⋯" của một người: xem chi tiết (dòng mở ra), rồi đúng các bước của vòng đời ở trạng thái này. Duyệt
  // nằm ở chi tiết (xem đủ xác thực trước) và ở thanh hàng loạt.
  const menu = (p: Partner): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      {
        label: t("partners.view"),
        href: hrefWith("/marketing/affiliate", base, { open: p.id }, "#partners-h"),
      },
    ];
    if (!manage || p.status === "terminated") return items;
    if (p.status === "suspended") {
      items.push({
        label: t("partners.reopen"),
        change: {
          action: reopenAction,
          id: p.id,
          expect: p.updated_at,
          value: "active",
          done: t("partners.reopened"),
          undo: { label: t("undo"), done: t("undone") },
        },
      });
    }
    if (p.status === "active") {
      items.push({ label: t("suspend.submit"), dialog: <SuspendDialog id={p.id} name={p.name} /> });
    }
    items.push({
      label: t("terminate.submit"),
      danger: true,
      dialog: <TerminateDialog id={p.id} name={p.name} />,
    });
    return items;
  };
  return (
    <div className="blocks">
      <Kpis
        label={t("partners.kpis")}
        items={[
          {
            label: t("partnerState.active"),
            value: formatCount(count("active"), locale),
            sub: t("partners.kpiActiveSub"),
          },
          {
            label: t("partnerState.pending_review"),
            value: formatCount(count("pending_review"), locale),
            sub: t("partners.kpiReviewSub"),
          },
          {
            label: t("partnerState.pending_verification"),
            value: formatCount(count("pending_verification"), locale),
            sub: t("partners.kpiVerifySub"),
          },
          {
            label: t("partnerState.suspended"),
            value: formatCount(count("suspended"), locale),
            sub: t("partners.kpiSuspendedSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="partners-h">
        <BlockHead id="partners-h" title={t("partners.title")} about={t("partners.about")} />
        <Chips
          label={t("partners.filter")}
          chips={[
            {
              href: "/marketing/affiliate",
              label: t("partners.all"),
              on: !chip,
              count: all.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/marketing/affiliate", {}, { chip: c }),
              label: t(`partnerState.${c}`),
              on: chip === c,
              count: count(c),
            })),
          ]}
        />
        <div className="card tcard">
          <BulkTable
            ids={rows.map((p) => p.id)}
            actions={
              manage
                ? [
                    {
                      key: "approve",
                      label: t("partners.approve"),
                      tone: "pri",
                      run: bulkApprovePartners,
                    },
                    {
                      key: "suspend",
                      label: t("suspend.submit"),
                      run: bulkSuspendPartners,
                      field: { label: t("suspend.reason") },
                      confirm: {
                        title: t("partners.bulkSuspendTitle"),
                        points: [t("suspend.intro")],
                        submit: t("suspend.submit"),
                      },
                    },
                    { key: "reopen", label: t("partners.reopen"), run: bulkReopenPartners },
                    {
                      key: "terminate",
                      label: t("terminate.submit"),
                      tone: "danger",
                      run: bulkTerminatePartners,
                      field: { label: t("terminate.reason") },
                      confirm: {
                        title: t("partners.bulkTerminateTitle"),
                        points: [
                          t("terminate.point1"),
                          t("terminate.point2"),
                          t("terminate.point3"),
                        ],
                        submit: t("terminate.submit"),
                      },
                    },
                  ]
                : []
            }
          >
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <Th>{t("partners.partner")}</Th>
                  <Th>{t("partners.code")}</Th>
                  <Th>{t("partners.tax")}</Th>
                  <Th>{t("partners.kyc")}</Th>
                  <Th>{t("partners.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isOpen = open === p.id;
                  const issues = gateIssues(p, program.terms_version);
                  return [
                    <tr key={p.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={p.id} name={p.name} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <OpenLink
                            open={isOpen}
                            href={hrefWith(
                              "/marketing/affiliate",
                              base,
                              { open: p.id },
                              "#partners-h",
                            )}
                            closeHref={hrefWith("/marketing/affiliate", base, {})}
                          >
                            {p.name}
                          </OpenLink>
                          <span className="sub">
                            {p.roles.map((r) => t(`roles.${r}`)).join(", ")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("partners.code")} className="mono">
                        {p.code}
                      </Td>
                      <Td label={t("partners.tax")}>{t(`taxSubject.${p.tax_subject}`)}</Td>
                      <Td label={t("partners.kyc")}>{kycText(p)}</Td>
                      <Td label={t("partners.state")}>
                        <Status tone={TONE[p.status]}>{t(`partnerState.${p.status}`)}</Status>
                      </Td>
                      <Td label={t("actions")}>
                        <RowMenu label={tt("moreFor", { name: p.name })} items={menu(p)} />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <DetailRow key={`${p.id}-open`} cols={manage ? 7 : 6}>
                        <h3 className="h2">{p.name}</h3>
                        <KV
                          items={[
                            [t("partners.roles"), p.roles.map((r) => t(`roles.${r}`)).join(", ")],
                            [
                              t("partners.code"),
                              <span key="c" className="mono">
                                {p.code}
                              </span>,
                            ],
                            [
                              t("partners.terms"),
                              p.terms_version
                                ? t("partners.termsAccepted", { v: p.terms_version })
                                : t("partners.termsMissing"),
                            ],
                            [t("partners.tax"), t(`taxSubject.${p.tax_subject}`)],
                            [
                              t("partners.taxCode"),
                              p.tax_code_set ? t("partners.secretSet") : t("partners.notGiven"),
                            ],
                            ...(["affiliate", "livestream"] as const).map((k) => {
                              const v = p.kyc[k];
                              return [
                                t(`partners.kycFor.${k}`),
                                v ? (
                                  <span key={k}>
                                    {Date.parse(v.expires_at) > Date.now()
                                      ? t("partners.kycUntil")
                                      : t("partners.kycExpired")}{" "}
                                    <Time value={v.expires_at} date />
                                  </span>
                                ) : (
                                  "—"
                                ),
                              ] as const;
                            }),
                            [
                              t("partners.phone"),
                              p.kyc.phone_verified
                                ? t("partners.phoneOk")
                                : t("partners.phoneMissing"),
                            ],
                            [
                              t("partners.payoutAccount"),
                              p.payout_account_set
                                ? t("partners.secretSet")
                                : t("partners.notGiven"),
                            ],
                            Number(p.approved_unpaid.amount) > 0
                              ? [
                                  t("partners.unpaid"),
                                  formatMoney(p.approved_unpaid.amount, "VND", locale),
                                ]
                              : null,
                            p.status_reason
                              ? [
                                  t("partners.reason"),
                                  p.status_reason.startsWith("affiliate.")
                                    ? t(`gate.${p.status_reason.replaceAll(".", "_")}`)
                                    : p.status_reason,
                                ]
                              : null,
                            [t("partners.registered"), <Time key="r" value={p.created_at} date />],
                          ]}
                        />
                        {issues.length > 0 ? (
                          <p className="note warn">
                            {t("partners.missing", {
                              list: issues
                                .map((i) => t(`gate.${i.replaceAll(".", "_")}`))
                                .join(", "),
                            })}
                          </p>
                        ) : (
                          <p className="fhint">{t("partners.gateNote")}</p>
                        )}
                        {manage && p.status !== "terminated" ? (
                          <span className="row-acts">
                            {p.status === "pending_review" ? (
                              <InlineAction
                                action={approveAction}
                                id={p.id}
                                label={t("partners.approve")}
                                done={t("partners.approved", { name: p.name })}
                              />
                            ) : null}
                            {p.status === "active" ? (
                              <SuspendDialog id={p.id} name={p.name} />
                            ) : null}
                            {p.status === "suspended" ? (
                              <ChangeButtons
                                action={reopenAction}
                                id={p.id}
                                expect={p.updated_at}
                                moves={[
                                  {
                                    value: "active",
                                    label: t("partners.reopen"),
                                    done: t("partners.reopened"),
                                    tone: "pri",
                                  },
                                ]}
                                undo={{ label: t("undo"), done: t("undone") }}
                              />
                            ) : null}
                            <TerminateDialog id={p.id} name={p.name} />
                          </span>
                        ) : null}
                      </DetailRow>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <p className="gr-legal">{t("partners.legal")}</p>
      </section>
      <p className="note">
        <b>{t("partners.oneLevelTitle")}</b> {t("partners.oneLevelText")}
      </p>
    </div>
  );
}
