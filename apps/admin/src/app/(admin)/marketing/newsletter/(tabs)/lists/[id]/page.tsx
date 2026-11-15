import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteList } from "@/app/(admin)/marketing/newsletter/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Back, DetailHead, Facts, Forbidden } from "@/components/engage/common";
import { ListEditForm } from "@/components/engage/list-form";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load } from "@/lib/core";
import {
  count,
  hrefWith,
  NEWSLETTER_MANAGE,
  NEWSLETTER_READ,
  NEWSLETTER_SEND,
  pickText,
} from "@/lib/engage";
import type { NewsletterList } from "@/lib/newsletter";
import { can } from "@/lib/viewer";

// Một danh sách nhận tin: số đăng ký, sửa (`If-Match`), xoá (core từ chối khi còn chiến dịch
// chưa xong).
export default async function ListPage(props: PageProps<"/marketing/newsletter/lists/[id]">) {
  const { id } = await props.params;
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  let list: NewsletterList;
  try {
    ({ data: list } = await load((client) =>
      client.GET("/api/v1/newsletter/lists/{id}", { params: { path: { id } } }),
    ));
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const [manage, sender] = await Promise.all([can(NEWSLETTER_MANAGE), can(NEWSLETTER_SEND)]);
  const name = pickText(list.name, locale) || list.key;
  return (
    <div className="blocks">
      <Back href="/marketing/newsletter/lists" label={t("backToLists")} />
      <DetailHead
        title={name}
        description={pickText(list.description, locale) || undefined}
        actions={
          <Link
            className="btn sm"
            href={hrefWith("/marketing/newsletter/subscribers", { list: list.id })}
          >
            {t("seeSubscribers")}
          </Link>
        }
      />
      <section className="block" aria-labelledby="list-sum">
        <h3 id="list-sum" className="h2">
          {t("listSummary")}
        </h3>
        <div className="card padded">
          <Facts
            items={[
              [t("col.confirmed"), count(list.subscriptions.confirmed, locale)],
              [t("col.unconfirmed"), count(list.subscriptions.unconfirmed, locale)],
              [t("col.unsubscribed"), count(list.subscriptions.unsubscribed, locale)],
              [t("createdLabel"), <Time key="c" value={list.created_at} />],
            ]}
          />
        </div>
      </section>
      {manage ? (
        <section className="block" aria-labelledby="list-edit">
          <div className="block-head">
            <h3 id="list-edit" className="h2">
              {t("editList")}
            </h3>
            <ConfirmButton
              action={deleteList}
              fields={{ id: list.id, expect: list.updated_at }}
              label={t("deleteList")}
              title={t("deleteListTitle", { name })}
              points={[t("deleteListSubs"), t("deleteListRefused"), t("deleteNoUndo")]}
              submit={t("deleteSubmit")}
            />
          </div>
          <div className="card padded">
            <ListEditForm list={list} canSendPosts={sender} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
