import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { bulkLiftAction, liftAction } from "@/app/(admin)/customers/actions";
import { BlockDialog, CodRuleDialog, LookupForm } from "@/components/customers/forms";
import { ChangeButtons } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import { BlockHead, Cell2, hrefWith, Kpis, param, Status } from "@/components/growth/blocks";
import { SampleBadge } from "@/components/sample-badge";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Pager } from "@/components/ui/pager";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { maskPhone } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import {
  type BlockChip,
  blockState,
  codStats,
  listCodBlocks,
  listCodRules,
  ruleState,
} from "@/sample/customers";
import { CUSTOMER_TABS, ENDPOINTS_45_RISK } from "../shared";

const CHIPS: readonly BlockChip[] = ["blocked", "lifted", "expired"];
const STATE_TONE = { active: "b-ok", scheduled: "b-sched", closed: "b-arch" } as const;
const BLOCK_TONE: Record<BlockChip, string> = {
  blocked: "b-bad",
  lifted: "b-arch",
  expired: "b-draft",
};

// Tab "Rủi ro COD" (bước 45, `orders.risk`): chống bom hàng khi giao nhận tiền. Thống kê theo SĐT đã băm
// theo khách; đơn từ kênh bán ngoài không tính (SĐT do kênh che). Không chặn vĩnh viễn: mọi lần chặn có lý
// do và hạn, người bị chặn vẫn mua được nếu trả trước. Gỡ chặn đảo được (Hoàn tác). Danh sách chặn
// dùng bộ bảng (W-058): chọn nhiều để gỡ (lặp từng lần chặn), sắp theo hạn / lúc chặn, phân trang có tổng.
const BASE = "/customers/cod";

export default async function CodPage(props: PageProps<"/customers/cod">) {
  // Tab dữ liệu mẫu (bước 47): tắt dữ liệu mẫu thì không có.
  if (!sampleDataEnabled()) notFound();
  if (!(await can(CUSTOMER_TABS.cod))) notFound();
  const [t, locale, params, stats, rules] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
    codStats(),
    listCodRules(),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const [all, blocks] = await Promise.all([listCodBlocks(), listCodBlocks(chip)]);
  const day = (d: string) => formatDay(d, locale);
  const sort = readSort(params, ["until", "blocked"], { field: "blocked", dir: "desc" });
  const paging = readPage(params);
  const page = slicePage(
    sortRows(blocks.data, (b) => (sort.field === "until" ? b.until : b.blocked_at), sort.dir),
    paging.page,
    paging.per,
  );
  const keep = {
    chip: chip ?? "",
    ...(param(params, "sort") ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const bulk: BulkActionSpec[] = [{ key: "lift", label: t("cod.lift"), run: bulkLiftAction }];
  return (
    <div className="blocks">
      <Kpis
        label={t("cod.kpis")}
        items={[
          {
            label: t("cod.kpiOrders"),
            value: formatCount(stats.cod_orders, locale),
            sub: t("cod.kpiOrdersSub"),
          },
          {
            label: t("cod.kpiFailed"),
            value: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(stats.fail_ratio_pct)}%`,
            sub: t("cod.kpiFailedSub", { n: stats.failed }),
          },
          {
            label: t("cod.kpiRules"),
            value: formatCount(stats.active_rules, locale),
            sub: t("cod.kpiRulesSub", { n: stats.scheduled_rules }),
          },
          {
            label: t("cod.kpiBlocked"),
            value: formatCount(stats.blocked, locale),
            sub: t("cod.kpiBlockedSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="codrules-h">
        <BlockHead
          id="codrules-h"
          title={t("cod.rulesTitle")}
          about={t("cod.rulesAbout")}
          actions={
            <>
              <SampleBadge step="45" endpoint={ENDPOINTS_45_RISK} />
              <CodRuleDialog />
            </>
          }
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("cod.condition")}</Th>
                <Th>{t("cod.scope")}</Th>
                <Th>{t("cod.action")}</Th>
                <Th>{t("cod.effective")}</Th>
                <Th>{t("loyalty.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((r) => {
                const state = ruleState(r.effective_from, r.effective_to);
                return (
                  <tr key={r.id}>
                    <Td className="rt-title">
                      {r.kind === "fail_ratio"
                        ? t("cod.failRule", { n: r.min_orders, pct: r.max_fail_ratio_pct })
                        : t("cod.totalRule", {
                            amount: formatMoney(r.order_total_min?.amount ?? 0, "VND", locale),
                          })}
                    </Td>
                    <Td label={t("cod.scope")}>{r.org_name}</Td>
                    <Td label={t("cod.action")}>{t(`codRule.actions.${r.action}`)}</Td>
                    <Td label={t("cod.effective")}>
                      {day(r.effective_from)}
                      {r.effective_to ? <> – {day(r.effective_to)}</> : null}
                    </Td>
                    <Td label={t("loyalty.state")}>
                      <Status tone={STATE_TONE[state]}>{t(`ruleState.${state}`)}</Status>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="lookup-h">
        <BlockHead id="lookup-h" title={t("lookup.title")} />
        <LookupForm />
      </section>
      <section className="block half" aria-label={t("cod.legalTitle")}>
        <p className="note">
          <b>{t("cod.legalTitle")}</b> {t("cod.legalText")}
        </p>
      </section>
      <section className="block" aria-labelledby="blocks-h">
        <BlockHead id="blocks-h" title={t("cod.blocksTitle")} actions={<BlockDialog />} />
        <Chips
          label={t("cod.filter")}
          chips={[
            { href: BASE, label: t("cod.all"), on: !chip, count: all.data.length },
            ...CHIPS.map((c) => ({
              href: hrefWith(BASE, {}, { chip: c }),
              label: t(`cod.states.${c}`),
              on: chip === c,
              count: all.data.filter((b) => blockState(b) === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <BulkTable ids={page.data.map((b) => b.id)} actions={bulk}>
            <Table cards>
              <thead>
                <tr>
                  <SelectAllTh />
                  <Th>{t("cod.buyer")}</Th>
                  <Th>{t("cod.reason")}</Th>
                  <SortTh field="until" sort={sort} base={BASE} keep={keep}>
                    {t("cod.until")}
                  </SortTh>
                  <SortTh field="blocked" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("cod.by")}
                  </SortTh>
                  <Th>{t("loyalty.state")}</Th>
                  <Th>
                    <span className="vh">{t("accounts.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((b) => {
                  const state = blockState(b);
                  return (
                    <tr key={b.id}>
                      <SelectTd id={b.id} name={maskPhone(b.phone)} />
                      <Td className="rt-title">
                        <Cell2
                          main={<span className="gr-mask">{maskPhone(b.phone)}</span>}
                          sub={t("cod.codOrders", { n: b.cod_orders })}
                        />
                      </Td>
                      <Td label={t("cod.reason")}>
                        <Cell2 main={t(`block.reasons.${b.reason}`)} sub={b.note} />
                      </Td>
                      <Td label={t("cod.until")}>{day(b.until)}</Td>
                      <Td label={t("cod.by")}>
                        <Cell2 main={b.blocked_by.name} sub={<Time value={b.blocked_at} />} />
                      </Td>
                      <Td label={t("loyalty.state")}>
                        <Status tone={BLOCK_TONE[state]}>{t(`cod.states.${state}`)}</Status>
                      </Td>
                      <Td className="rt-acts">
                        {state === "blocked" ? (
                          <ChangeButtons
                            action={liftAction}
                            id={b.id}
                            expect={b.updated_at}
                            moves={[
                              { value: "lifted", label: t("cod.lift"), done: t("cod.lifted") },
                            ]}
                            undo={{ label: t("undo"), done: t("undone") }}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </BulkTable>
          {page.data.length === 0 ? <p className="empty">{t("cod.none")}</p> : null}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>
    </div>
  );
}
