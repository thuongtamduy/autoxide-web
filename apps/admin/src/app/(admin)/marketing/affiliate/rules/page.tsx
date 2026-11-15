import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { closeRuleAction } from "@/app/(admin)/marketing/affiliate/actions";
import { PreviewForm, ProgramForm } from "@/components/affiliate/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import { BlockHead, Cell2, hrefWith, param, Status } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { AFFILIATE_MANAGE } from "@/lib/affiliate";
import { formatDay } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { getProgram, listPartners, listRules, ruleStateOf } from "@/sample/affiliate";
import { AFFILIATE_TABS, productOptions } from "../shared";

const CHIPS = ["active", "scheduled", "closed"] as const;
const TONE = { active: "b-ok", scheduled: "b-sched", closed: "b-arch" } as const;

// Tab "Quy tắc hoa hồng": dữ liệu có ngày hiệu lực, chỉ thêm, không sửa. Đơn tính theo quy tắc hiệu lực lúc
// đặt; tỉ lệ được chụp vào dòng hoa hồng nên đổi quy tắc không làm đổi hoa hồng cũ. Cùng tab có xem trước
// hoa hồng cho một dòng giả định và cài đặt chương trình.
export default async function RulesPage(props: PageProps<"/marketing/affiliate/rules">) {
  if (!(await can(AFFILIATE_TABS.rules))) notFound();
  const [t, locale, params, rules, program, partners, products, manage] = await Promise.all([
    getTranslations("affiliate"),
    getLocale(),
    props.searchParams,
    listRules(),
    getProgram(),
    listPartners(),
    productOptions(),
    can(AFFILIATE_MANAGE),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const rows = rules.data.filter((r) => !chip || ruleStateOf(r) === chip);
  const day = (d: string) => formatDay(d, locale);
  const partnerOptions = partners.data
    .filter((p) => p.status === "active")
    .map((p) => ({ value: p.id, label: p.name }));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="rules-h">
        <BlockHead id="rules-h" title={t("rules.title")} about={t("rules.about")} />
        <Chips
          label={t("rules.filter")}
          chips={[
            {
              href: "/marketing/affiliate/rules",
              label: t("rules.all"),
              on: !chip,
              count: rules.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/marketing/affiliate/rules", {}, { chip: c }),
              label: t(`ruleState.${c}`),
              on: chip === c,
              count: rules.data.filter((r) => ruleStateOf(r) === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("rules.scope")}</Th>
                <Th>{t("rules.appliesTo")}</Th>
                <Th>{t("rules.rate")}</Th>
                <Th>{t("rules.effective")}</Th>
                <Th>{t("rules.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const state = ruleStateOf(r);
                const target =
                  r.scope === "default"
                    ? t("rule.scopes.default")
                    : r.scope === "category"
                      ? t("rules.category", { name: r.target_name ?? "" })
                      : t("rules.product", { name: r.target_name ?? "" });
                return (
                  <tr key={r.id}>
                    <Td className="rt-title">
                      <Cell2
                        main={target}
                        sub={`${t("rules.priority", { n: r.priority })}${r.note ? ` · ${r.note}` : ""}`}
                      />
                    </Td>
                    <Td label={t("rules.appliesTo")}>{r.partner_name ?? t("rule.everyone")}</Td>
                    <Td label={t("rules.rate")}>
                      <Cell2
                        main={`${r.rate_bp / 100}%`}
                        sub={
                          r.cap
                            ? t("rules.cap", { amount: formatMoney(r.cap.amount, "VND", locale) })
                            : undefined
                        }
                      />
                    </Td>
                    <Td label={t("rules.effective")}>
                      {day(r.effective_from)}
                      {r.effective_to ? <> – {day(r.effective_to)}</> : null}
                    </Td>
                    <Td label={t("rules.state")}>
                      <Status tone={TONE[state]}>{t(`ruleState.${state}`)}</Status>
                    </Td>
                    <Td className="rt-acts">
                      {manage && state === "active" ? (
                        <ConfirmButton
                          action={closeRuleAction}
                          fields={{ id: r.id }}
                          label={t("rules.close")}
                          title={t("rules.closeTitle")}
                          points={[t("rules.close1"), t("rules.close2")]}
                          submit={t("rules.closeSubmit")}
                          done={t("rules.closed")}
                        />
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="cpreview-h">
        <BlockHead id="cpreview-h" title={t("preview.title")} about={t("preview.about")} />
        <PreviewForm products={products} partners={partnerOptions} />
      </section>
      <section className="block half" aria-labelledby="program-h">
        <BlockHead id="program-h" title={t("program.title")} about={t("program.about")} />
        {manage ? (
          <ProgramForm
            program={{
              days: program.attribution_days,
              precedence: program.precedence[0] === "live" ? "live_click_code" : "click_code_live",
              base: program.commission_base,
              auto: program.auto_approve,
              mode: program.payout_mode,
              min: program.min_payout.amount,
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
