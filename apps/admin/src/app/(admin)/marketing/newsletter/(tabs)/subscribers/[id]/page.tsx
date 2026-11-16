import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteSubscriber, setSubscriberStatus } from "@/app/(admin)/marketing/newsletter/actions";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { Back, DetailHead, Facts, Forbidden } from "@/components/engage/common";
import { BlockDialog, UnsubscribeForm } from "@/components/engage/subscriber-forms";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { NEWSLETTER_MANAGE, NEWSLETTER_READ, pickText } from "@/lib/engage";
import { type NewsletterList, SUBSCRIPTION_BADGE, type Subscriber } from "@/lib/newsletter";
import { can } from "@/lib/viewer";

type Consent = {
  text?: string;
  version?: string;
  at?: string;
  source?: string;
  ip_fingerprint?: string;
};

// Một người đăng ký: đăng ký từng danh sách kèm bằng chứng đồng ý (nguồn, văn bản, lúc nào), chặn
// / bỏ chặn (có Hoàn tác), huỷ đăng ký khỏi danh sách, xoá hẳn.
export default async function SubscriberPage(
  props: PageProps<"/marketing/newsletter/subscribers/[id]">,
) {
  const { id } = await props.params;
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  let subscriber: Subscriber;
  let lists: NewsletterList[];
  try {
    [{ data: subscriber }, { data: lists }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/newsletter/subscribers/{id}", { params: { path: { id } } }),
      ),
      load((client) =>
        client.GET("/api/v1/newsletter/lists", { params: { query: { limit: 200 } } }),
      ),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const manage = await can(NEWSLETTER_MANAGE);
  const nameOf = (listId: string, key?: string | null) => {
    const list = lists.find((l) => l.id === listId);
    return list ? pickText(list.name, locale) || list.key : (key ?? "—");
  };
  const blocked = subscriber.status === "blocked";
  const active = subscriber.subscriptions.filter((s) => s.status !== "unsubscribed");
  return (
    <div className="blocks">
      <Back href="/marketing/newsletter/subscribers" label={t("backToSubscribers")} />
      <DetailHead
        title={subscriber.email}
        mono
        badge={
          <span className={blocked ? "badge b-bad" : "badge b-ok"}>
            <span className="dot" />
            {blocked ? t("blocked") : t("active")}
          </span>
        }
        description={subscriber.name ?? undefined}
      />
      {manage ? (
        <div className="eg-acts">
          {blocked ? (
            <ChangeButtons
              action={setSubscriberStatus}
              id={subscriber.id}
              expect={subscriber.updated_at}
              undo={{ label: t("undo"), done: t("undone") }}
              moves={[{ value: "active", label: t("unblock"), done: t("unblocked") }]}
            />
          ) : (
            <BlockDialog id={subscriber.id} expect={subscriber.updated_at} />
          )}
          <ConfirmButton
            action={deleteSubscriber}
            fields={{ id: subscriber.id }}
            label={t("deleteSubscriber")}
            title={t("deleteSubscriberTitle", { email: subscriber.email })}
            points={[t("deleteSubscriberGone"), t("deleteSubscriberKeep"), t("deleteNoUndo")]}
            submit={t("deleteSubmit")}
          />
        </div>
      ) : null}
      <section className="block" aria-labelledby="sub-info">
        <h3 id="sub-info" className="h2">
          {t("subscriberInfo")}
        </h3>
        <div className="card padded">
          <Facts
            items={[
              [t("localeLabel"), t(`locales.${subscriber.locale}`)],
              [t("col.softBounces"), String(subscriber.soft_bounces)],
              [
                t("suppressedLabel"),
                subscriber.suppressed ? t(`reason.${subscriber.suppressed}`) : t("no"),
              ],
              [t("blockedReason"), subscriber.blocked_reason ?? "—"],
              [t("createdLabel"), <Time key="c" value={subscriber.created_at} />],
            ]}
          />
        </div>
      </section>
      <section className="block" aria-labelledby="sub-lists">
        <h3 id="sub-lists" className="h2">
          {t("subscriptions")}
        </h3>
        <p className="fhint">{t("subscriptionsAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("col.list")}</Th>
                <Th>{t("col.status")}</Th>
                <Th>{t("col.consent")}</Th>
                <Th>{t("col.requested")}</Th>
              </tr>
            </thead>
            <tbody>
              {subscriber.subscriptions.map((sub) => {
                const consent = sub.consent as Consent | null | undefined;
                return (
                  <tr key={sub.list_id}>
                    <Td className="rt-title">{nameOf(sub.list_id, sub.list_key)}</Td>
                    <Td label={t("col.status")}>
                      <span className={SUBSCRIPTION_BADGE[sub.status]}>
                        <span className="dot" />
                        {t(`sub.${sub.status}`)}
                      </span>
                    </Td>
                    <Td label={t("col.consent")}>
                      {consent ? (
                        <span className="cell2">
                          <span>{t("consentSource", { source: consent.source ?? "—" })}</span>
                          {consent.text ? <span className="sub">“{consent.text}”</span> : null}
                          {consent.at ? (
                            <span className="sub">
                              <Time value={consent.at} />
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="whitespace-nowrap" label={t("col.requested")}>
                      <Time value={sub.requested_at} />
                      {sub.confirmed_at ? (
                        <span className="sub">
                          {" · "}
                          {t("confirmedAt")} <Time value={sub.confirmed_at} />
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        {manage ? (
          <UnsubscribeForm
            id={subscriber.id}
            expect={subscriber.updated_at}
            lists={active.map((s) => ({ id: s.list_id, name: nameOf(s.list_id, s.list_key) }))}
          />
        ) : null}
      </section>
    </div>
  );
}
