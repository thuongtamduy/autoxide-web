import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Forbidden, Pager } from "@/components/engage/common";
import { ImportDialog } from "@/components/engage/subscriber-forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
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
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter/subscribers";

// Tab "Người đăng ký": tìm theo một phần email, lọc theo danh sách và trạng thái đăng ký (trong
// danh sách đã chọn, hoặc ở bất kỳ danh sách nào), hay chỉ người bị chặn (`blocked=true`: không
// nhận thư nào); nhập từ CSV kèm nguồn đồng ý.
export default async function SubscribersPage(
  props: PageProps<"/marketing/newsletter/subscribers">,
) {
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  const params = await props.searchParams;
  const status = oneOf(params, "status", SUBSCRIPTION_STATUSES);
  const list = one(params, "list");
  const email = one(params, "email");
  const blocked = one(params, "blocked") === "1" ? "1" : undefined;
  const cursor = one(params, "cursor", 500);
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
  const next = page.pagination.next_cursor;
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
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.email")}</Th>
                  <Th>{t("col.lists")}</Th>
                  <Th>{t("col.softBounces")}</Th>
                  <Th>{t("col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((s) => (
                  <tr key={s.id}>
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
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { ...keep, status, blocked }) : null}
          next={next ? hrefWith(BASE, { ...keep, status, blocked, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
