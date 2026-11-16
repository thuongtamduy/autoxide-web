import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden, Pager } from "@/components/engage/common";
import { CreateListDialog } from "@/components/engage/list-form";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { isForbidden, load } from "@/lib/core";
import {
  count,
  hrefWith,
  NEWSLETTER_MANAGE,
  NEWSLETTER_READ,
  NEWSLETTER_SEND,
  one,
  pickText,
} from "@/lib/engage";
import { type NewsletterList, sumSubscriptions } from "@/lib/newsletter";
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter/lists";

// Tab "Danh sách nhận tin": số đăng ký theo trạng thái (tổng ở đầu trang), xác nhận hai bước,
// công khai ở trang đăng ký, và cách xử lý khi Nội dung đăng bài mới.
export default async function ListsPage(props: PageProps<"/marketing/newsletter/lists">) {
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  const params = await props.searchParams;
  const cursor = one(params, "cursor", 500);
  let page: { data: NewsletterList[]; pagination: { next_cursor?: string | null } };
  try {
    page = await load((client) =>
      client.GET("/api/v1/newsletter/lists", {
        params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    throw error;
  }
  const [manage, sender] = await Promise.all([can(NEWSLETTER_MANAGE), can(NEWSLETTER_SEND)]);
  const sum = sumSubscriptions(page.data);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("listDeleted")} /> : null}
      <div className="kpis">
        {(["confirmed", "unconfirmed", "unsubscribed"] as const).map((key) => (
          <div key={key} className="card kpi">
            <span className="kpi-label">{t(`sum.${key}`)}</span>
            <span className="kpi-value tabular-nums">{count(sum[key], locale)}</span>
            <span className="kpi-sub">{t(`sumAbout.${key}`)}</span>
          </div>
        ))}
      </div>
      <section className="block" aria-labelledby="lists-h">
        <div className="block-head">
          <h2 id="lists-h" className="h2">
            {t("lists")}
          </h2>
          {manage ? <CreateListDialog canSendPosts={sender} /> : null}
        </div>
        <p className="fhint">{t("listsAbout")}</p>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("noLists")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.listName")}</Th>
                  <Th>{t("col.confirmed")}</Th>
                  <Th>{t("col.unconfirmed")}</Th>
                  <Th>{t("col.unsubscribed")}</Th>
                  <Th>{t("col.newPosts")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((list) => (
                  <tr key={list.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link className="open ell" href={`${BASE}/${list.id}`}>
                          {pickText(list.name, locale) || list.key}
                        </Link>
                        <span className="sub">
                          <span className="mono">{list.key}</span>
                          {" · "}
                          {list.public ? t("public") : t("private")}
                          {" · "}
                          {list.double_opt_in ? t("doubleOptIn") : t("singleOptIn")}
                        </span>
                      </span>
                    </Td>
                    <Td className="tabular-nums" label={t("col.confirmed")}>
                      <Link
                        className="eg-count"
                        href={hrefWith("/marketing/newsletter/subscribers", {
                          list: list.id,
                          status: "confirmed",
                        })}
                      >
                        {count(list.subscriptions.confirmed, locale)}
                      </Link>
                    </Td>
                    <Td className="tabular-nums" label={t("col.unconfirmed")}>
                      {count(list.subscriptions.unconfirmed, locale)}
                    </Td>
                    <Td className="tabular-nums" label={t("col.unsubscribed")}>
                      {count(list.subscriptions.unsubscribed, locale)}
                    </Td>
                    <Td label={t("col.newPosts")}>
                      {t(`listForm.newPostsMode.${list.new_posts}`)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager first={cursor ? BASE : null} next={next ? hrefWith(BASE, { cursor: next }) : null} />
      </section>
      <p className="note">{t("consentLaw")}</p>
    </div>
  );
}
