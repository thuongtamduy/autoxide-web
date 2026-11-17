import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import {
  bulkDisableCodesAction,
  disableCodeAction,
} from "@/app/(admin)/marketing/promotions/actions";
import { GenerateCodesForm } from "@/components/promotions/forms";
import { Meter } from "@/components/promotions/meter";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";
import { PROMOTIONS_CODES_MANAGE, usedPercent, vnDateTime, vnDay } from "@/lib/promotions";
import { readPage, readSort, slicePage } from "@/lib/table";
import {
  CODE_SORTS,
  type CodeState,
  codeCounts,
  listCodes,
  listPromotions,
} from "@/sample/promotions";

const STATES: CodeState[] = ["usable", "not_started", "exhausted", "expired", "disabled"];

const BASE = "/marketing/promotions/codes";

const STATE_BADGE: Record<CodeState, string> = {
  usable: "badge b-ok",
  not_started: "badge b-sched",
  exhausted: "badge b-arch",
  expired: "badge b-arch",
  disabled: "badge b-bad",
};

// Tab "Mã giảm giá": mọi mã của các chương trình theo mã. Mở một mã để xem nó áp cho biến thể nào,
// điều kiện, số lượt còn (số thật từ bộ đếm, không làm tròn). Sinh lô mã ở cuối trang. Chọn nhiều để vô
// hiệu, sao chép, xuất CSV; "⋯" trên dòng; sắp theo mã / lượt dùng / ngày tạo; phân trang có tổng.
export default async function CodesPage(props: PageProps<"/marketing/promotions/codes">) {
  const gate = await commerceGate(PROMOTIONS_CODES_MANAGE);
  if (gate) return gate;
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("promotions"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const state = STATES.find((s) => s === one("state"));
  const q = one("q").slice(0, 40);
  const open = one("open");
  const sort = readSort(params, CODE_SORTS, { field: "created", dir: "desc" });
  const paging = readPage(params);
  const [listed, counts, { data: programs }] = await Promise.all([
    listCodes({ ...(state ? { state } : {}), q, locale, sort, limit: 1000 }),
    codeCounts(),
    listPromotions({ locale }),
  ]);
  const page = slicePage(listed.data, paging.page, paging.per);
  const keep = {
    state: state ?? "",
    q,
    ...(one("sort") ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      ...keep,
      ...(paging.page > 1 ? { page: String(paging.page) } : {}),
      ...(paging.per !== 25 ? { per: String(paging.per) } : {}),
      ...change,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/marketing/promotions/codes?${query}` : "/marketing/promotions/codes";
  };
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const codeBased = programs
    .filter((p) => p.trigger === "code" && p.status !== "ended" && p.status !== "cancelled")
    .map((p) => ({ value: p.id, label: p.title }));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="codes-h">
        <div className="block-head">
          <h2 id="codes-h" className="h2">
            {t("vouchers.title")}
          </h2>
          <a className="btn" href="/marketing/promotions/codes/export.csv" download>
            {t("vouchers.export")}
          </a>
        </div>
        <p className="fhint">{t("vouchers.about")}</p>
        <nav className="chips" aria-label={t("vouchers.byState")}>
          <Link
            className={state ? "chip" : "chip on"}
            href={href({ state: null, open: null, cursor: null })}
            aria-current={state ? undefined : "page"}
          >
            {t("programs.all")} <span className="cnt">{counts.all}</span>
          </Link>
          {STATES.map((s) => (
            <Link
              key={s}
              className={state === s ? "chip on" : "chip"}
              href={href({ state: s, open: null, cursor: null })}
              aria-current={state === s ? "page" : undefined}
            >
              {t(`codeState.${s}`)} <span className="cnt">{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <search aria-label={t("vouchers.search")}>
          <form className="filters" action="/marketing/promotions/codes">
            <AutoFilter />
            {state ? <input type="hidden" name="state" value={state} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="code-q">
                {t("vouchers.search")}
              </label>
              <input
                id="code-q"
                className="inp mono"
                type="search"
                name="q"
                defaultValue={q}
                maxLength={40}
              />
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("programs.filter")}
              </button>
            </div>
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("vouchers.empty")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((c) => c.id)}
              texts={Object.fromEntries(page.data.map((c) => [c.id, c.code]))}
              actions={[
                {
                  key: "disable",
                  label: t("vouchers.disable"),
                  tone: "danger",
                  run: bulkDisableCodesAction,
                  confirm: {
                    title: t("vouchers.bulkDisableTitle"),
                    points: [t("vouchers.disableKeep"), t("vouchers.disableNoUndo")],
                    submit: t("vouchers.disable"),
                  },
                },
                { key: "copy", label: t("vouchers.copy"), copy: true },
                {
                  key: "export",
                  label: t("vouchers.exportSelected"),
                  href: "/marketing/promotions/codes/export.csv",
                  download: true,
                },
              ]}
            >
              <Table cards>
                <thead>
                  <tr>
                    <SelectAllTh />
                    <SortTh field="code" sort={sort} base={BASE} keep={keep}>
                      {t("vouchers.code")}
                    </SortTh>
                    <Th>{t("vouchers.program")}</Th>
                    <SortTh field="used" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("vouchers.used")}
                    </SortTh>
                    <SortTh field="created" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("vouchers.created")}
                    </SortTh>
                    <Th>{t("vouchers.state")}</Th>
                    <Th>
                      <span className="vh">{t("vouchers.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((c) => {
                    const isOpen = open === c.id;
                    const limit = c.usage_limit;
                    return [
                      <tr key={c.id} data-current={isOpen ? "" : undefined}>
                        <SelectTd id={c.id} name={c.code} />
                        <Td className="rt-title">
                          <Link
                            className="open mono"
                            href={isOpen ? href({ open: null }) : `${href({ open: c.id })}#codes-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {c.code}
                          </Link>
                        </Td>
                        <Td label={t("vouchers.program")}>{c.promotion_title}</Td>
                        <Td label={t("vouchers.used")}>
                          <Meter
                            label={
                              limit === null
                                ? t("programs.usedNoLimit", {
                                    used: formatCount(c.usage_count, locale),
                                  })
                                : t("vouchers.usedLeft", {
                                    used: formatCount(c.usage_count, locale),
                                    limit: formatCount(limit, locale),
                                    left: formatCount(c.remaining ?? 0, locale),
                                  })
                            }
                            percent={usedPercent(c.usage_count, limit)}
                          />
                        </Td>
                        <Td label={t("vouchers.created")}>{vnDay(c.created_at, locale)}</Td>
                        <Td label={t("vouchers.state")}>
                          <span className={STATE_BADGE[c.state]}>
                            <span className="dot" />
                            {t(`codeState.${c.state}`)}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          <RowMenu
                            label={tt("moreFor", { name: c.code })}
                            items={[
                              {
                                label: isOpen ? t("vouchers.hide") : t("vouchers.view"),
                                href: isOpen
                                  ? href({ open: null })
                                  : `${href({ open: c.id })}#codes-h`,
                              },
                              {
                                label: t("vouchers.copyOne"),
                                copy: c.code,
                                done: t("vouchers.copied"),
                              },
                              ...(c.state === "disabled"
                                ? []
                                : [
                                    {
                                      label: t("vouchers.disable"),
                                      danger: true,
                                      dialog: (
                                        <ConfirmAction
                                          action={disableCodeAction}
                                          id={c.id}
                                          label={t("vouchers.disable")}
                                          title={t("vouchers.disableTitle", { code: c.code })}
                                          points={[
                                            t("vouchers.disableKeep"),
                                            t("vouchers.disableNoUndo"),
                                          ]}
                                          submit={t("vouchers.disable")}
                                          done={t("vouchers.disabled")}
                                        />
                                      ),
                                    },
                                  ]),
                            ]}
                          />
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${c.id}-open`} className="cat-detail-row">
                          <td colSpan={7}>
                            <div className="cat-detail">
                              <h3 className="h2 mono">{c.code}</h3>
                              <dl className="cat-kv">
                                <dt>{t("vouchers.appliesTo")}</dt>
                                <dd>{c.applies_to.join(", ") || t("vouchers.allItems")}</dd>
                                <dt>{t("vouchers.remaining")}</dt>
                                <dd>
                                  {c.remaining === null
                                    ? t("vouchers.unlimited")
                                    : t("vouchers.remainingText", {
                                        left: formatCount(c.remaining, locale),
                                        held: c.held_count,
                                      })}
                                </dd>
                                <dt>{t("vouchers.perCustomer")}</dt>
                                <dd>
                                  {c.per_customer_limit === null
                                    ? t("detail.perCustomerAny")
                                    : t("detail.perCustomer", { limit: c.per_customer_limit })}
                                </dd>
                                <dt>{t("vouchers.minOrder")}</dt>
                                <dd>
                                  {c.min_order ? money(c.min_order.amount) : t("vouchers.none")}
                                </dd>
                                <dt>{t("vouchers.window")}</dt>
                                <dd>
                                  {vnDateTime(c.starts_at, locale)} –{" "}
                                  {vnDateTime(c.ends_at, locale)}
                                </dd>
                                {c.customer_groups.length > 0 ? (
                                  <>
                                    <dt>{t("detail.groups")}</dt>
                                    <dd>{c.customer_groups.join(", ")}</dd>
                                  </>
                                ) : null}
                                <dt>{t("vouchers.source")}</dt>
                                <dd>
                                  {t(`vouchers.sources.${c.source}`)} ·{" "}
                                  {c.public ? t("vouchers.public") : t("vouchers.private")}
                                </dd>
                                <dt>{t("vouchers.matching")}</dt>
                                <dd>{t("vouchers.matchingText")}</dd>
                              </dl>
                              <p className="fhint">{t("vouchers.listedPrice")}</p>
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>

      <section className="block" aria-label={t("generate.title")}>
        <div className="pm-pair">
          {codeBased.length > 0 ? (
            <GenerateCodesForm promotions={codeBased} />
          ) : (
            <p className="empty">{t("generate.none")}</p>
          )}
          <p className="note">
            <b>{t("vouchers.holdStrong")}</b> {t("vouchers.holdText")}
          </p>
        </div>
      </section>
    </div>
  );
}
