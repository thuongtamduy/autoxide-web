import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkBlockSubscribers,
  bulkDeleteSubscribers,
  bulkUnblockSubscribers,
  deleteSubscriber,
  setSubscriberStatus,
} from "@/app/(admin)/marketing/newsletter/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips, Forbidden } from "@/components/engage/common";
import { BlockDialog, ImportDialog } from "@/components/engage/subscriber-forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import {
  hrefWith,
  NEWSLETTER_MANAGE,
  NEWSLETTER_READ,
  one,
  oneOf,
  PAGE_SIZE,
  pickText,
} from "@/lib/engage";
import {
  type NewsletterList,
  SUBSCRIPTION_BADGE,
  SUBSCRIPTION_STATUSES,
  type Subscriber,
} from "@/lib/newsletter";
import { readSort } from "@/lib/table";
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter/subscribers";

// Tab "Người đăng ký": tìm theo một phần email, lọc theo danh sách và trạng thái đăng ký (trong
// danh sách đã chọn, hoặc ở bất kỳ danh sách nào), hay chỉ người bị chặn (`blocked=true`: không
// nhận thư nào); nhập từ CSV kèm nguồn đồng ý. Chọn nhiều để chặn / bỏ chặn / xoá (lặp lệnh từng cái
// của core); "⋯" trên dòng; sắp theo ngày đăng ký bằng `order` của core; phân trang theo con trỏ.
export default async function SubscribersPage(
  props: PageProps<"/marketing/newsletter/subscribers">,
) {
  const t = await getTranslations("engage.newsletter");
  const tt = await getTranslations("table");
  const locale = await getLocale();
  const params = await props.searchParams;
  const status = oneOf(params, "status", SUBSCRIPTION_STATUSES);
  const list = one(params, "list");
  const email = one(params, "email");
  const blocked = one(params, "blocked") === "1" ? "1" : undefined;
  const cursor = one(params, "cursor", 500);
  // Core chỉ sắp theo thời gian tạo (`order=asc|desc`): chỉ cột "Đăng ký lúc" sắp được.
  const sort = readSort(params, ["created"], { field: "created", dir: "desc" });
  const order = one(params, "sort") ? sort.dir : undefined;
  let page: { data: Subscriber[]; pagination: { next_cursor?: string | null } };
  let lists: NewsletterList[];
  try {
    [page, { data: lists }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/newsletter/subscribers", {
          params: {
            query: {
              limit: PAGE_SIZE,
              ...(status ? { status } : {}),
              ...(list ? { list_id: list } : {}),
              ...(email ? { email } : {}),
              ...(blocked ? { blocked: true } : {}),
              ...(order ? { order } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        }),
      ),
      load((client) =>
        client.GET("/api/v1/newsletter/lists", { params: { query: { limit: 200 } } }),
      ),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    throw error;
  }
  const manage = await can(NEWSLETTER_MANAGE);
  const names = lists.map((l) => ({ id: l.id, name: pickText(l.name, locale) || l.key }));
  const keep = { list, email };
  const sortKeep = { ...keep, status, blocked, ...(order ? { sort: "created", dir: order } : {}) };
  const next = page.pagination.next_cursor;
  const undo = { label: t("undo"), done: t("undone") };
  // "⋯" của một dòng: mở, chặn (hộp thoại có lý do) hay bỏ chặn (có Hoàn tác), xoá hẳn.
  const menu = (s: Subscriber): RowMenuItem[] => [
    { label: t("openSubscriber"), href: `${BASE}/${s.id}` },
    ...(manage
      ? [
          s.status === "blocked"
            ? {
                label: t("unblock"),
                change: {
                  action: setSubscriberStatus,
                  id: s.id,
                  expect: s.updated_at,
                  value: "active",
                  done: t("unblocked"),
                  undo,
                },
              }
            : { label: t("block.open"), dialog: <BlockDialog id={s.id} expect={s.updated_at} /> },
          {
            label: t("deleteSubscriber"),
            danger: true,
            dialog: (
              <ConfirmButton
                action={deleteSubscriber}
                fields={{ id: s.id }}
                label={t("deleteSubscriber")}
                title={t("deleteSubscriberTitle", { email: s.email })}
                points={[t("deleteSubscriberGone"), t("deleteSubscriberKeep"), t("deleteNoUndo")]}
                submit={t("deleteSubmit")}
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("subscriberDeleted")} /> : null}
      <section className="block" aria-labelledby="subs-h">
        <div className="block-head">
          <h2 id="subs-h" className="h2">
            {t("subscribers")}
          </h2>
          {manage && names.length > 0 ? <ImportDialog lists={names} /> : null}
        </div>
        <p className="fhint">{t("subscribersAbout")}</p>
        <Chips
          label={t("filterStatus")}
          chips={[
            { href: hrefWith(BASE, keep), label: t("all"), on: !status && !blocked },
            ...SUBSCRIPTION_STATUSES.map((s) => ({
              href: hrefWith(BASE, { ...keep, status: s }),
              label: t(`sub.${s}`),
              on: status === s && !blocked,
            })),
            {
              href: hrefWith(BASE, { ...keep, blocked: "1" }),
              label: t("blockedFilter"),
              on: Boolean(blocked),
            },
          ]}
        />
        <form method="get" action={BASE} className="filters">
          <AutoFilter />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {blocked ? <input type="hidden" name="blocked" value="1" /> : null}
          <label className="fld grow">
            <span className="lab">{t("searchEmail")}</span>
            <input
              className="inp"
              type="search"
              name="email"
              defaultValue={email ?? ""}
              placeholder={t("searchEmailHint")}
              maxLength={200}
            />
          </label>
          <label className="fld">
            <span className="lab">{t("list")}</span>
            <select className="inp" name="list" defaultValue={list ?? ""}>
              <option value="">{t("allLists")}</option>
              {names.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("apply")}
            </button>
            {email || list ? (
              <Link className="btn ghost" href={hrefWith(BASE, { status })}>
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">
              {status || list || email || blocked ? t("noMatch") : t("noSubscribers")}
            </p>
          ) : (
            <BulkTable
              ids={page.data.map((s) => s.id)}
              actions={
                manage
                  ? [
                      {
                        key: "block",
                        label: t("block.open"),
                        run: bulkBlockSubscribers,
                        confirm: {
                          title: t("bulkBlockTitle"),
                          points: [t("block.noMail"), t("block.keepsSubs")],
                          submit: t("block.submit"),
                        },
                      },
                      { key: "unblock", label: t("unblock"), run: bulkUnblockSubscribers },
                      {
                        key: "delete",
                        label: t("deleteSubscriber"),
                        tone: "danger",
                        run: bulkDeleteSubscribers,
                        confirm: {
                          title: t("bulkDeleteTitle"),
                          points: [
                            t("deleteSubscriberGone"),
                            t("deleteSubscriberKeep"),
                            t("deleteNoUndo"),
                          ],
                          submit: t("deleteSubmit"),
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
                    <Th>{t("col.email")}</Th>
                    <Th>{t("col.lists")}</Th>
                    <Th>{t("col.softBounces")}</Th>
                    <Th>{t("col.status")}</Th>
                    <SortTh field="created" sort={sort} base={BASE} keep={sortKeep} first="desc">
                      {t("col.requested")}
                    </SortTh>
                    <Th>
                      <span className="vh">{t("col.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((s) => (
                    <tr key={s.id}>
                      {manage ? <SelectTd id={s.id} name={s.email} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open mono ell"
                            href={`/marketing/newsletter/subscribers/${s.id}`}
                          >
                            {s.email}
                          </Link>
                          <span className="sub">
                            {[s.name, t(`locales.${s.locale}`)].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("col.lists")}>
                        <span className="eg-tags">
                          {s.subscriptions.map((sub) => (
                            <span key={sub.list_id} className={SUBSCRIPTION_BADGE[sub.status]}>
                              {sub.list_key ?? "—"} · {t(`sub.${sub.status}`)}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td className="tabular-nums" label={t("col.softBounces")}>
                        {s.soft_bounces}
                      </Td>
                      <Td label={t("col.status")}>
                        {s.status === "blocked" ? (
                          <span className="badge b-bad">
                            <span className="dot" />
                            {t("blocked")}
                          </span>
                        ) : s.suppressed ? (
                          <span className="badge b-warn">
                            <span className="dot" />
                            {t("suppressedAs", { reason: t(`reason.${s.suppressed}`) })}
                          </span>
                        ) : (
                          <span className="badge b-ok">
                            <span className="dot" />
                            {t("active")}
                          </span>
                        )}
                      </Td>
                      <Td label={t("col.requested")}>
                        <Time value={s.created_at} date />
                      </Td>
                      <Td className="rt-acts">
                        <RowMenu label={tt("moreFor", { name: s.email })} items={menu(s)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, sortKeep) : null}
          next={next ? hrefWith(BASE, { ...sortKeep, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
