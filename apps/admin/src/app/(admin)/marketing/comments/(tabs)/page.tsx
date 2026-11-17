import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  bulkApproveComments,
  bulkPurgeComments,
  bulkRejectComments,
  bulkSpamComments,
  moderateComment,
  purgeComment,
} from "@/app/(admin)/marketing/comments/actions";
import { ChangeButtons, ConfirmButton, type Move } from "@/components/engage/actions";
import { Chips, Forbidden } from "@/components/engage/common";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  COMMENT_BADGE,
  COMMENT_STATUSES,
  type CommentDetail,
  type CommentStatus,
  holdReasons,
  isKnownReason,
  moderationMoves,
  targetHref,
} from "@/lib/comments";
import { isForbidden, load } from "@/lib/core";
import {
  COMMENTS_MODERATE,
  COMMENTS_READ,
  excerpt,
  hrefWith,
  one,
  oneOf,
  PAGE_SIZE,
} from "@/lib/engage";
import { readSort } from "@/lib/table";
import { can } from "@/lib/viewer";

const BASE = "/marketing/comments";

// Tab "Hàng chờ duyệt": mặc định bình luận đang chờ, mới nhất trước; chip đổi trạng thái, lọc theo
// loại đích, một đích, và chữ (không dấu vẫn tìm ra). Dòng có một nút (duyệt), các nút còn lại và
// "Xoá hẳn" trong "⋯", có Hoàn tác; chọn nhiều để duyệt / từ chối / spam / xoá (lặp lệnh từng cái của
// core). Sắp theo thời gian gửi bằng `order` của core; phân trang theo con trỏ (core không trả tổng).
export default async function QueuePage(props: PageProps<"/marketing/comments">) {
  if (!(await can(COMMENTS_READ))) redirect(`${BASE}/settings`);
  const t = await getTranslations("engage.comments");
  const tt = await getTranslations("table");
  const params = await props.searchParams;
  const status = oneOf(params, "status", COMMENT_STATUSES) ?? "pending";
  const type = one(params, "type");
  const target = one(params, "target", 500);
  const q = one(params, "q");
  const cursor = one(params, "cursor", 500);
  // Core chỉ sắp theo thời gian tạo (`order=asc|desc`), nên chỉ cột "Gửi lúc" sắp được.
  const sort = readSort(params, ["created"], { field: "created", dir: "desc" });
  const order = one(params, "sort") ? sort.dir : undefined;
  let page: { data: CommentDetail[]; pagination: { next_cursor?: string | null } };
  let types: string[];
  try {
    const [found, settings] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/comments", {
          params: {
            query: {
              limit: PAGE_SIZE,
              status,
              ...(type ? { target_type: type } : {}),
              ...(type && target ? { target_id: target } : {}),
              ...(q ? { q } : {}),
              ...(order ? { order } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        }),
      ),
      load((client) => client.GET("/api/v1/comments/public/settings")),
    ]);
    page = found;
    types = settings.data.target_types;
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_READ} />;
    throw error;
  }
  const moderate = await can(COMMENTS_MODERATE);
  // Tiêu đề của đích có sẵn trong từng bình luận (`target_title` của core, chỉ khi đích công khai).
  const onlyTitle = page.data.find(
    (c) => c.target_type === type && c.target_id === target,
  )?.target_title;
  const keep = { type, target, q, ...(order ? { sort: "created", dir: order } : {}) };
  const next = page.pagination.next_cursor;
  const undo = { label: t("undo"), done: t("undone") };
  const moves = (s: CommentStatus): Move[] =>
    moderationMoves(s).map((to) => {
      const move: Move = { value: to, label: t(`move.${to}`), done: t(`moved.${to}`) };
      if (to === "published") move.tone = "pri";
      return move;
    });
  const sortKeep = { ...keep, status: status === "pending" ? undefined : status };
  // "⋯" của một dòng: các nước đi còn lại (nút đầu hiện sẵn trên dòng), mở chi tiết, xoá hẳn.
  const menu = (c: CommentDetail): RowMenuItem[] => [
    { label: t("open"), href: `${BASE}/${c.id}` },
    ...moves(c.status)
      .slice(1)
      .map((m) => ({
        label: m.label,
        change: {
          action: moderateComment,
          id: c.id,
          expect: c.updated_at,
          value: m.value,
          done: m.done,
          undo,
        },
      })),
    {
      label: t("purge"),
      danger: true,
      dialog: (
        <ConfirmButton
          action={purgeComment}
          fields={{ id: c.id }}
          label={t("purge")}
          title={t("purgeTitle")}
          points={[
            c.parent_id ? t("purgeReply") : t("purgeThread", { count: c.reply_count }),
            t("purgeAudit"),
            t("purgeNoUndo"),
          ]}
          submit={t("purgeSubmit")}
        />
      ),
    },
  ];

  return (
    <div className="blocks">
      {params.purged ? <Flash text={t("purged", { count: Number(params.purged) || 1 })} /> : null}
      <section className="block" aria-labelledby="queue-h">
        <div className="block-head">
          <h2 id="queue-h" className="h2">
            {t("queue")}
          </h2>
        </div>
        <p className="fhint">{t("queueAbout")}</p>
        <Chips
          label={t("filterStatus")}
          chips={COMMENT_STATUSES.map((s) => ({
            href: hrefWith(BASE, { ...keep, status: s === "pending" ? undefined : s }),
            label: t(`status.${s}`),
            on: status === s,
          }))}
        />
        <form method="get" action={BASE} className="filters">
          <AutoFilter />
          {status !== "pending" ? <input type="hidden" name="status" value={status} /> : null}
          {target ? <input type="hidden" name="target" value={target} /> : null}
          <label className="fld grow">
            <span className="lab">{t("search")}</span>
            <input
              className="inp"
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchHint")}
              maxLength={200}
            />
          </label>
          {types.length > 0 ? (
            <label className="fld">
              <span className="lab">{t("targetType")}</span>
              <select className="inp" name="type" defaultValue={type ?? ""}>
                <option value="">{t("allTypes")}</option>
                {types.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("apply")}
            </button>
            {q || type || target ? (
              <Link
                className="btn ghost"
                href={hrefWith(BASE, { status: status === "pending" ? undefined : status })}
              >
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        {type && target ? (
          <p className="fhint">
            {t("onlyTarget", {
              title: onlyTitle ?? target,
            })}
          </p>
        ) : null}
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">
              {status === "pending" && !q && !type ? t("queueEmpty") : t("noMatch")}
            </p>
          ) : (
            <BulkTable
              ids={page.data.map((c) => c.id)}
              actions={
                moderate
                  ? [
                      {
                        key: "approve",
                        label: t("move.published"),
                        tone: "pri",
                        run: bulkApproveComments,
                      },
                      { key: "reject", label: t("move.rejected"), run: bulkRejectComments },
                      { key: "spam", label: t("move.spam"), run: bulkSpamComments },
                      {
                        key: "purge",
                        label: t("purge"),
                        tone: "danger",
                        run: bulkPurgeComments,
                        confirm: {
                          title: t("bulkPurgeTitle"),
                          points: [t("bulkPurgeThreads"), t("purgeAudit"), t("purgeNoUndo")],
                          submit: t("purgeSubmit"),
                        },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {moderate ? <SelectAllTh /> : null}
                    <Th>{t("col.comment")}</Th>
                    <Th>{t("col.target")}</Th>
                    <Th>{t("col.reason")}</Th>
                    <Th>{t("col.status")}</Th>
                    <SortTh field="created" sort={sort} base={BASE} keep={sortKeep} first="desc">
                      {t("col.sent")}
                    </SortTh>
                    {moderate ? <Th>{t("col.actions")}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((c) => {
                    const reasons = holdReasons(c.hold_reason);
                    return (
                      <tr key={c.id}>
                        {moderate ? (
                          <SelectTd id={c.id} name={c.body ? excerpt(c.body, 40) : t("noText")} />
                        ) : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link className="open eg-clamp" href={`${BASE}/${c.id}`}>
                              {c.body ? excerpt(c.body, 140) : t("noText")}
                            </Link>
                            <span className="sub">
                              {c.author_name ?? t("noName")} · {t(`kind.${c.author_kind}`)}
                              {c.parent_id ? ` · ${t("reply")}` : ""}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("col.target")}>
                          <span className="cell2">
                            <Link className="ell" href={targetHref(c.target_type, c.target_id)}>
                              {c.target_title ?? c.target_id}
                            </Link>
                            <span className="sub mono">{c.target_type}</span>
                          </span>
                        </Td>
                        <Td label={t("col.reason")}>
                          <span className="eg-tags">
                            {reasons.map((r) => (
                              <span key={r} className="tag">
                                {isKnownReason(r) ? t(`hold.${r}`) : r}
                              </span>
                            ))}
                            {c.report_count > 0 ? (
                              <span className="tag">{t("reports", { count: c.report_count })}</span>
                            ) : null}
                            {reasons.length === 0 && c.report_count === 0 ? "—" : null}
                          </span>
                        </Td>
                        <Td label={t("col.status")}>
                          <span className={COMMENT_BADGE[c.status]}>
                            <span className="dot" />
                            {t(`status.${c.status}`)}
                          </span>
                        </Td>
                        <Td label={t("col.sent")}>
                          <Time value={c.created_at} />
                        </Td>
                        {moderate ? (
                          <Td label={t("col.actions")}>
                            <span className="row-acts">
                              <ChangeButtons
                                action={moderateComment}
                                id={c.id}
                                expect={c.updated_at}
                                undo={undo}
                                moves={moves(c.status).slice(0, 1)}
                              />
                              <RowMenu
                                label={tt("moreFor", {
                                  name: c.body ? excerpt(c.body, 40) : t("noText"),
                                })}
                                items={menu(c)}
                              />
                            </span>
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, sortKeep) : null}
          next={
            next
              ? hrefWith(BASE, {
                  ...keep,
                  status: status === "pending" ? undefined : status,
                  cursor: next,
                })
              : null
          }
        />
      </section>
      <p className="note">{t("lawNote")}</p>
    </div>
  );
}
