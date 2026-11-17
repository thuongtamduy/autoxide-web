import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  approveSummaryAction,
  bulkPublishReviewAction,
  bulkSeenAction,
  dropSummaryAction,
  publishAction,
  seenAction,
} from "@/app/(admin)/sales/stores/actions";
import { HideDialog, ReplyDialog } from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount } from "@/lib/format";
import { readPage, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  average,
  listReviewStats,
  listReviews,
  listSummaries,
  type ReviewChip,
  reviewCounts,
} from "@/sample/stores";
import { STORE_TABS } from "../../orders/shared";

const CHIPS: ReviewChip[] = ["new", "published", "hidden", "low"];

// Tab "Đánh giá": đánh giá của người đã nhận hàng hiện ngay. Không ẩn vì nội dung chê (Luật Bảo vệ quyền
// lợi người tiêu dùng 19/2023 — cần đối chiếu văn bản gốc); chỉ ẩn với lý do trong danh sách cho phép,
// ghi người ẩn và báo người viết; mở lại được. Tóm tắt bằng AI là bản nháp, duyệt rồi mới hiện.
// Dòng hiện một nút ("Đã xem" cho đánh giá mới, "Hiện lại" cho đánh giá đã ẩn); trả lời, ẩn nằm trong
// "⋯". Chọn nhiều để đánh dấu đã xem hay hiện lại (lặp lệnh từng cái). Ẩn hàng loạt không có: mỗi lần ẩn
// cần lý do và ghi chú riêng cho người viết. Phân trang có tổng (nguồn mẫu có đủ danh sách).
export default async function ReviewsPage(props: PageProps<"/sales/stores/reviews">) {
  if (!(await can(STORE_TABS.reviews))) notFound();
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("stores.reviews"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const chip = CHIPS.find((c) => c === one("chip")) ?? "all";
  const open = one("open");
  const paging = readPage(params);
  const [list, counts, summaries, stats] = await Promise.all([
    listReviews(chip),
    reviewCounts(),
    listSummaries(),
    listReviewStats(),
  ]);
  const page = slicePage(list.data, paging.page, paging.per);
  const keep = { chip: chip === "all" ? null : chip, per: params.per ? paging.per : null };
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      chip: chip === "all" ? "" : chip,
      page: page.page > 1 ? String(page.page) : "",
      per: keep.per ? String(keep.per) : "",
      ...change,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const q = next.toString();
    return q ? `/sales/stores/reviews?${q}` : "/sales/stores/reviews";
  };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="reviews-h">
        <div className="block-head">
          <h2 id="reviews-h" className="h2">
            {t("title")}
          </h2>
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={chip === "all" ? "chip on" : "chip"}
            href={href({ chip: null, open: null, page: null })}
          >
            {t("chips.all")} <span className="cnt">{counts.all}</span>
          </Link>
          {CHIPS.map((c) => (
            <Link
              key={c}
              className={chip === c ? "chip on" : "chip"}
              href={href({ chip: c, open: null, page: null })}
            >
              {t(`chips.${c}`)} <span className="cnt">{counts[c]}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((r) => r.id)}
              actions={[
                { key: "seen", label: t("markSeen"), run: bulkSeenAction },
                { key: "publish", label: t("publish"), run: bulkPublishReviewAction },
              ]}
            >
              <Table cards>
                <thead>
                  <tr>
                    <SelectAllTh />
                    <Th>{t("product")}</Th>
                    <Th>{t("rating")}</Th>
                    <Th>{t("body")}</Th>
                    <Th>{t("date")}</Th>
                    <Th>{t("state")}</Th>
                    <Th>
                      <span className="vh">{t("actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((r) => {
                    const isOpen = open === r.id;
                    const isNew = r.status === "published" && !r.seen;
                    const menu: RowMenuItem[] = [
                      {
                        label: isOpen ? t("hideDetail") : t("openDetail"),
                        href: isOpen ? href({ open: null }) : `${href({ open: r.id })}#reviews-h`,
                      },
                    ];
                    if (r.status === "published" && !r.seller_name) {
                      menu.push({ label: t("reply"), dialog: <ReplyDialog id={r.id} /> });
                    }
                    if (r.status === "published") {
                      menu.push({
                        label: t("hide"),
                        danger: true,
                        dialog: <HideDialog id={r.id} />,
                      });
                    }
                    return [
                      <tr key={r.id} data-current={isOpen ? "" : undefined}>
                        <SelectTd id={r.id} name={r.product_name} />
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link
                              className="open"
                              href={
                                isOpen ? href({ open: null }) : `${href({ open: r.id })}#reviews-h`
                              }
                              scroll={false}
                              aria-expanded={isOpen}
                            >
                              {r.product_name}
                            </Link>
                            <span className="sub">
                              {r.author_name} · <span className="mono">{r.order_number}</span>
                              {r.seller_name ? ` · ${r.seller_name}` : ""}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("rating")}>
                          <span title={t("stars", { n: r.rating })}>
                            <span aria-hidden="true">{"★".repeat(r.rating)}</span>
                            <span className="vh">{t("stars", { n: r.rating })}</span>
                          </span>
                        </Td>
                        <Td label={t("body")}>{r.body}</Td>
                        <Td label={t("date")}>
                          <Time value={r.created_at} date />
                        </Td>
                        <Td label={t("state")}>
                          <span className={r.status === "hidden" ? "badge b-arch" : "badge b-ok"}>
                            <span className="dot" />
                            {t(`status.${r.status}`)}
                          </span>
                          {isNew ? <span className="badge b-violet">{t("new")}</span> : null}
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {isNew ? (
                              <InlineAction
                                action={seenAction}
                                id={r.id}
                                label={t("markSeen")}
                                ariaLabel={`${t("markSeen")}: ${r.product_name}`}
                                done={t("seen")}
                              />
                            ) : null}
                            {r.status === "hidden" ? (
                              <ConfirmAction
                                action={publishAction}
                                id={r.id}
                                label={t("publish")}
                                title={t("publishTitle", { product: r.product_name })}
                                points={[t("publishPoint")]}
                                submit={t("publish")}
                                done={t("published")}
                                danger={false}
                              />
                            ) : null}
                            <RowMenu label={tt("moreFor", { name: r.product_name })} items={menu} />
                          </span>
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${r.id}-open`} className="cat-detail-row">
                          <td colSpan={7}>
                            <div className="cat-detail">
                              <dl className="cat-kv">
                                <dt>{t("media")}</dt>
                                <dd>
                                  {r.media_count > 0
                                    ? t("mediaCount", { n: r.media_count })
                                    : t("noMedia")}
                                </dd>
                                <dt>{t("verified")}</dt>
                                <dd>{t("verifiedValue", { order: r.order_number })}</dd>
                                {r.flags.length > 0 ? (
                                  <>
                                    <dt>{t("flags")}</dt>
                                    <dd>{r.flags.map((f) => t(`flag.${f}`)).join(", ")}</dd>
                                  </>
                                ) : null}
                                {r.reply ? (
                                  <>
                                    <dt>{t("replyGiven")}</dt>
                                    <dd>{r.reply}</dd>
                                  </>
                                ) : null}
                                {r.status === "hidden" ? (
                                  <>
                                    <dt>{t("hiddenReason")}</dt>
                                    <dd>
                                      {r.hidden_reason ? t(`reasons.${r.hidden_reason}`) : "—"}
                                      {r.hidden_note ? ` — ${r.hidden_note}` : ""}
                                    </dd>
                                    <dt>{t("hiddenBy")}</dt>
                                    <dd>
                                      {r.hidden_by?.name ?? "—"}{" "}
                                      {r.hidden_at ? <Time value={r.hidden_at} /> : null}
                                    </dd>
                                  </>
                                ) : null}
                              </dl>
                              <p className="fhint">
                                {r.seller_name
                                  ? t("sellerNote")
                                  : r.rating <= 2 && r.flags.length === 0
                                    ? t("negativeNote")
                                    : r.flags.length > 0
                                      ? t("flagNote")
                                      : t("replyNote")}
                              </p>
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
        <Pager
          total={page.total}
          page={page.page}
          per={paging.per}
          base="/sales/stores/reviews"
          keep={keep}
        />
        <p className="note">{t("law")}</p>
      </section>

      <section className="block" aria-labelledby="ai-h">
        <div className="block-head">
          <h2 id="ai-h" className="h2">
            {t("ai.title")}
          </h2>
          <SampleBadge step="45" endpoint="POST /api/v1/orders/reviews/summaries (D-201, D-109)" />
        </div>
        <p className="fhint">{t("ai.about")}</p>
        <ul className="cat-lines">
          {summaries.data.map((s) => (
            <li key={s.id}>
              <span className="cell2">
                <span>
                  {t("ai.from", { product: s.product_name, n: s.source_count })}{" "}
                  <span
                    className={
                      s.status === "draft"
                        ? "badge b-violet"
                        : s.status === "live"
                          ? "badge b-ok"
                          : "badge b-arch"
                    }
                  >
                    {t(`ai.status.${s.status}`)}
                  </span>
                </span>
                <span className="sub">“{s.text}”</span>
              </span>
              {s.status === "draft" ? (
                <span className="row-acts">
                  <InlineAction
                    action={approveSummaryAction}
                    id={s.id}
                    label={t("ai.approve")}
                    done={t("ai.approved")}
                  />
                  <InlineAction
                    action={dropSummaryAction}
                    id={s.id}
                    label={t("ai.drop")}
                    done={t("ai.dropped")}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="block" aria-labelledby="stats-h">
        <div className="block-head">
          <h2 id="stats-h" className="h2">
            {t("statsTitle")}
          </h2>
        </div>
        <div className="kpis">
          {stats.data.map((s) => {
            const avg = average(s.counts);
            return (
              <div key={s.product_id} className="card padded">
                <h3 className="pm-h">
                  {t("statsHead", {
                    product: s.product_name,
                    mean: avg.mean.toLocaleString(locale),
                    total: formatCount(avg.total, locale),
                  })}
                </h3>
                <ul className="ord-stars">
                  {[5, 4, 3, 2, 1].map((star) => (
                    <li key={star}>
                      <span>{t("starLabel", { n: star })}</span>
                      <meter
                        min={0}
                        max={avg.total}
                        value={s.counts[star - 1] ?? 0}
                        aria-label={t("starLabel", { n: star })}
                      />
                      <span className="num">{formatCount(s.counts[star - 1] ?? 0, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
