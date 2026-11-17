import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  activateAction,
  cancelPromotionAction,
  endPromotionAction,
  runningAction,
} from "@/app/(admin)/marketing/promotions/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { EvaluateForm, ExtendDialog } from "@/components/promotions/forms";
import { Meter } from "@/components/promotions/meter";
import { Checks, historyText, STATUS_BADGE } from "@/components/promotions/views";
import { AutoFilter } from "@/components/ui/auto-filter";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay, toVietnamInput } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import {
  bpPercent,
  PROMOTIONS_PUBLISH,
  PROMOTIONS_WRITE,
  usedPercent,
  vnDateTime,
  vnRange,
} from "@/lib/promotions";
import { can } from "@/lib/viewer";
import {
  getPromotion,
  listLegalLimits,
  listPromotions,
  type PromotionDetail,
  type PromotionSummary,
  promotionStats,
  storeOptions,
} from "@/sample/promotions";

const FILTERS = ["active", "scheduled", "draft", "blocked", "paused", "ended"] as const;
type Filter = (typeof FILTERS)[number];

// Tab "Chương trình": bản nháp → đã lên lịch → đang chạy ↔ tạm dừng → đã kết thúc. Bật là lúc kiểm
// trần pháp luật, hồ sơ thông báo và mục tiêu. Mở một dòng để xem điều kiện, giá trước / sau khuyến
// mại, lịch sử và thao tác. Cuối trang: trần pháp luật đang hiệu lực và "Thử giỏ hàng".
export default async function ProgramsPage(props: PageProps<"/marketing/promotions">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("promotions"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = FILTERS.find((s) => s === one("status"));
  const q = one("q").slice(0, 200);
  const open = one("open");
  const [
    { data: rows },
    { data: all },
    { data: stats },
    detail,
    { data: limits },
    stores,
    publish,
    write,
  ] = await Promise.all([
    listPromotions({ ...(status ? { status } : {}), q, locale }),
    listPromotions({ locale }),
    promotionStats(),
    open ? getPromotion(open, locale) : Promise.resolve(null),
    listLegalLimits(),
    storeOptions(),
    can(PROMOTIONS_PUBLISH),
    can(PROMOTIONS_WRITE),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", q, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/marketing/promotions?${query}` : "/marketing/promotions";
  };
  const count = (f: Filter) =>
    all.filter((p) => (f === "blocked" ? p.blocked : p.status === f)).length;

  return (
    <div className="blocks">
      <section className="block" aria-label={t("programs.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("programs.kpiActive")}</span>
            <b className="kpi-value">{formatCount(stats.active, locale)}</b>
            <span className="kpi-sub">{t("programs.kpiActiveSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("programs.kpiScheduled")}</span>
            <b className="kpi-value">{formatCount(stats.scheduled, locale)}</b>
            <span className="kpi-sub">{t("programs.kpiScheduledSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("programs.kpiBlocked")}</span>
            <b className="kpi-value">{formatCount(stats.blocked, locale)}</b>
            <span className="kpi-sub">
              <Link className="open" href={href({ status: "blocked", open: null })}>
                {t("programs.kpiBlockedSub")}
              </Link>
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("programs.kpiNotices")}</span>
            <b className="kpi-value">{formatCount(stats.notices_pending, locale)}</b>
            <span className="kpi-sub">{t("programs.kpiNoticesSub")}</span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="programs-h">
        <div className="block-head">
          <h2 id="programs-h" className="h2">
            {t("programs.title")}
          </h2>
        </div>
        <p className="fhint">{t("programs.about")}</p>
        <nav className="chips" aria-label={t("programs.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null, open: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("programs.all")} <span className="cnt">{all.length}</span>
          </Link>
          {FILTERS.map((f) => (
            <Link
              key={f}
              className={status === f ? "chip on" : "chip"}
              href={href({ status: f, open: null })}
              aria-current={status === f ? "page" : undefined}
            >
              {t(`filters.${f}`)} <span className="cnt">{count(f)}</span>
            </Link>
          ))}
        </nav>
        <search aria-label={t("programs.search")}>
          <form className="filters" action="/marketing/promotions">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="pm-q">
                {t("programs.search")}
              </label>
              <input
                id="pm-q"
                className="inp"
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("programs.searchHint")}
                maxLength={200}
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
          {rows.length === 0 ? (
            <p className="empty">{t("programs.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("programs.program")}</Th>
                  <Th>{t("programs.appliesTo")}</Th>
                  <Th>{t("programs.window")}</Th>
                  <Th>{t("programs.used")}</Th>
                  <Th>{t("programs.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isOpen = open === p.id && detail !== null;
                  return [
                    <tr key={p.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: p.id })}#programs-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {p.title}
                          </Link>
                          <span className="sub">
                            {p.first_code ? `${t("programs.code", { code: p.first_code })} · ` : ""}
                            {t(`kinds.${p.kind}`)}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("programs.appliesTo")}>
                        <AppliesTo p={p} locale={locale} t={t} />
                      </Td>
                      <Td label={t("programs.window")}>
                        {vnRange(p.starts_at, p.ends_at, locale)}
                      </Td>
                      <Td label={t("programs.used")}>
                        <Meter
                          label={
                            p.status === "draft" || p.status === "scheduled"
                              ? t("programs.notStarted")
                              : p.usage_limit === null
                                ? t("programs.usedNoLimit", {
                                    used: formatCount(p.usage_count, locale),
                                  })
                                : t("programs.usedOf", {
                                    used: formatCount(p.usage_count, locale),
                                    limit: formatCount(p.usage_limit, locale),
                                  })
                          }
                          percent={usedPercent(p.usage_count, p.usage_limit)}
                        />
                      </Td>
                      <Td label={t("programs.state")}>
                        <span className="cell2">
                          <span className={STATUS_BADGE[p.status]}>
                            <span className="dot" />
                            {t(`status.${p.status}`)}
                          </span>
                          {p.blocked ? (
                            <span className="badge b-bad">
                              <span className="dot" />
                              {t("filters.blocked")}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                    </tr>,
                    isOpen && detail ? (
                      <tr key={`${p.id}-open`} className="cat-detail-row">
                        <td colSpan={5}>
                          <Detail p={detail.data} locale={locale} publish={publish} write={write} />
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

      <section className="block" aria-labelledby="limits-h">
        <div className="block-head">
          <h2 id="limits-h" className="h2">
            {t("limits.title")}
          </h2>
          <span className="badge b-draft">
            {t("limits.pack", { pack: limits[0]?.pack_version ?? "—" })}
          </span>
        </div>
        <p className="fhint">{t("limits.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("limits.kind")}</Th>
                <Th>{t("limits.program")}</Th>
                <Th className="text-right">{t("limits.max")}</Th>
                <Th>{t("limits.basis")}</Th>
              </tr>
            </thead>
            <tbody>
              {limits.map((l) => (
                <tr key={l.id}>
                  <Td className="rt-title">{t(`legalKinds.${l.promotion_kind}`)}</Td>
                  <Td label={t("limits.program")}>{t(`programKinds.${l.program_kind}`)}</Td>
                  <Td label={t("limits.max")} className="text-right num">
                    {l.max_bp === null ? t("limits.exception") : `${bpPercent(l.max_bp, locale)}%`}
                  </Td>
                  <Td label={t("limits.basis")}>
                    <span className="cell2">
                      <span>{l.legal_basis}</span>
                      <span className="sub">
                        {t("limits.from", { date: formatDay(l.effective_from, locale) })}
                        {l.needs_review ? ` · ${t("limits.review")}` : ""}
                      </span>
                      <span className="sub">{l.note}</span>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="evaluate">
        <div className="pm-pair">
          <div className="pm-stack">
            <div className="block-head">
              <h2 id="evaluate" className="h2">
                {t("evaluate.title")}
              </h2>
            </div>
            <p className="fhint">{t("evaluate.about")}</p>
            <EvaluateForm stores={stores.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <p className="note warn">
            <b>{t("legalNote.strong")}</b> {t("legalNote.text")}
          </p>
        </div>
      </section>
    </div>
  );
}

function AppliesTo({
  p,
  locale,
  t,
}: {
  p: PromotionSummary;
  locale: string;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const min = p.min_order ? formatMoney(p.min_order.amount, p.min_order.currency, locale) : null;
  const extra = [
    min ? t("programs.minOrder", { amount: min }) : "",
    p.customer_groups.length ? t("programs.groups", { groups: p.customer_groups.join(", ") }) : "",
  ].filter(Boolean);
  return (
    <span className="cell2">
      <span>
        {p.target_labels.length > 0
          ? p.target_labels.join(", ")
          : t("programs.everything", { org: p.org_name })}
      </span>
      {extra.length > 0 ? <span className="sub">{extra.join(" · ")}</span> : null}
    </span>
  );
}

async function Detail({
  p,
  locale,
  publish,
  write,
}: {
  p: PromotionDetail;
  locale: string;
  publish: boolean;
  write: boolean;
}) {
  const t = await getTranslations("promotions");
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const legal = p.checks.find((c) => c.key === "legal_limit");
  const value =
    p.kind === "percent_off" && p.value_bp !== null
      ? `${bpPercent(p.value_bp, locale)}%`
      : p.value
        ? money(p.value.amount)
        : p.kind === "buy_x_get_y"
          ? t("detail.buyGet", { buy: p.buy_quantity ?? 0, get: p.get_quantity ?? 0 })
          : "—";
  const fields: [string, string][] = [
    [t("detail.kind"), `${t(`kinds.${p.kind}`)} · ${t(`scopes.${p.scope}`)} · ${value}`],
    [
      t("detail.trigger"),
      p.trigger === "code"
        ? t("detail.needsCode", { code: p.first_code ?? "—", count: p.code_count })
        : t("detail.automatic"),
    ],
    [t("detail.org"), p.org_name],
    [
      t("detail.targets"),
      p.target_labels.join(", ") || t("programs.everything", { org: p.org_name }),
    ],
    [
      t("detail.stacking"),
      `${p.exclusive ? t("detail.exclusive") : t("detail.stackable")} · ${t("detail.priority", { priority: p.priority })}`,
    ],
    [
      t("detail.limits"),
      `${p.usage_limit === null ? t("detail.noLimit") : t("detail.total", { limit: formatCount(p.usage_limit, locale) })} · ${
        p.per_customer_limit === null
          ? t("detail.perCustomerAny")
          : t("detail.perCustomer", { limit: p.per_customer_limit })
      }`,
    ],
    [t("detail.window"), `${vnDateTime(p.starts_at, locale)} – ${vnDateTime(p.ends_at, locale)}`],
    [t("detail.returnUsage"), p.return_usage_on_cancel ? t("detail.yes") : t("detail.no")],
    [
      t("detail.legal"),
      legal?.params.max
        ? t("detail.legalCap", { max: legal.params.max, basis: legal.params.legal_basis ?? "" })
        : legal?.code
          ? legal.code
          : t("detail.legalNone"),
    ],
    [
      t("detail.notice"),
      p.notice_status === "submitted"
        ? t("detail.noticeDone", {
            reference: p.notice_reference ?? "",
            date: p.notice_submitted_at ? vnDateTime(p.notice_submitted_at, locale) : "",
          })
        : t(`noticeStatus.${p.notice_status}`),
    ],
  ];
  const history = await Promise.all(
    [...p.history]
      .reverse()
      .map(async (e) => ({ e, text: await historyText(e.code, e.params, locale) })),
  );
  if (p.customer_groups.length > 0) fields.push([t("detail.groups"), p.customer_groups.join(", ")]);
  if (p.held_count > 0)
    fields.push([t("detail.held"), t("detail.heldText", { count: p.held_count })]);
  return (
    <div className="cat-detail">
      <h3 className="h2">
        {p.title}
        {p.first_code ? ` (${p.first_code})` : ""}
      </h3>
      {p.last_activation_error && p.status === "draft" ? (
        <p className="falert" data-code={p.last_activation_error.code}>
          {t("detail.blocked", {
            code: p.last_activation_error.code,
            date: vnDateTime(p.last_activation_error.at, locale),
          })}
        </p>
      ) : null}
      <dl className="cat-kv">
        {fields.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
      {p.terms ? (
        <p className="fhint">
          <b>{t("detail.terms")}</b> {p.terms}
        </p>
      ) : null}
      {p.price_lines.length > 0 ? (
        <>
          <h4 className="pm-h">{t("detail.prices")}</h4>
          <ul className="cat-lines">
            {p.price_lines.map((l) => (
              <li key={l.variant_id}>
                <span>
                  <b className="mono">{l.sku}</b> {l.name}
                </span>
                <b className="num">
                  {l.reference ? money(l.reference.amount) : "—"} →{" "}
                  {l.after ? money(l.after.amount) : "—"}
                </b>
              </li>
            ))}
          </ul>
          {p.trigger === "code" ? <p className="fhint">{t("detail.codePriceNote")}</p> : null}
        </>
      ) : null}
      {p.status === "draft" ? (
        <>
          <h4 className="pm-h">{t("checks.title")}</h4>
          <Checks checks={p.checks} locale={locale} />
        </>
      ) : null}
      <h4 className="pm-h">{t("detail.history")}</h4>
      <ol className="timeline">
        {history.map(({ e, text }) => (
          <li key={`${e.at}-${e.code}`}>
            <span>
              {text}
              {e.version ? ` · ${t("detail.version", { version: e.version })}` : ""}
            </span>
            <span className="sub">
              {vnDateTime(e.at, locale)} · {e.actor.name}
            </span>
          </li>
        ))}
      </ol>
      <p className="fhint">{t(`notes.${p.status}`)}</p>
      <Actions p={p} publish={publish} write={write} />
    </div>
  );
}

async function Actions({
  p,
  publish,
  write,
}: {
  p: PromotionDetail;
  publish: boolean;
  write: boolean;
}) {
  const t = await getTranslations("promotions");
  const live = p.status === "active" || p.status === "paused" || p.status === "scheduled";
  return (
    <span className="row-acts">
      {publish && p.status === "draft" ? (
        <ConfirmAction
          action={activateAction}
          id={p.id}
          label={t("actions.activate")}
          title={t("actions.activateTitle", { title: p.title })}
          points={[
            t("actions.activateChecks"),
            t("actions.activateLocked"),
            t("actions.activateVersion"),
          ]}
          submit={t("actions.activateSubmit")}
          done={t("actions.activated")}
          danger={false}
        />
      ) : null}
      {publish && (p.status === "active" || p.status === "paused") ? (
        <ChangeButtons
          action={runningAction}
          id={p.id}
          expect={p.updated_at}
          moves={[
            p.status === "active"
              ? { value: "paused", label: t("actions.pause"), done: t("actions.paused") }
              : {
                  value: "active",
                  label: t("actions.resume"),
                  done: t("actions.resumed"),
                  tone: "pri",
                },
          ]}
          undo={{ label: t("undo"), done: t("undone") }}
        />
      ) : null}
      {write && live ? (
        <ExtendDialog
          id={p.id}
          title={p.title}
          ends={toVietnamInput(p.ends_at).replace("T", " ")}
          limit={p.usage_limit}
        />
      ) : null}
      {publish && (p.status === "active" || p.status === "paused") ? (
        <ConfirmAction
          action={endPromotionAction}
          id={p.id}
          label={t("actions.end")}
          title={t("actions.endTitle", { title: p.title })}
          points={[t("actions.endNow"), t("actions.endHeld"), t("actions.endFinal")]}
          submit={t("actions.endSubmit")}
          done={t("actions.ended")}
        />
      ) : null}
      {publish && (p.status === "draft" || p.status === "scheduled") ? (
        <ConfirmAction
          action={cancelPromotionAction}
          id={p.id}
          label={t("actions.cancel")}
          title={t("actions.cancelTitle", { title: p.title })}
          points={[t("actions.cancelFinal"), t("actions.cancelCodes")]}
          submit={t("actions.cancelSubmit")}
          done={t("actions.cancelled")}
        />
      ) : null}
    </span>
  );
}
