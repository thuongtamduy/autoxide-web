import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Forbidden, Pager } from "@/components/engage/common";
import { SendSetup } from "@/components/engage/send-setup";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { count, hrefWith, NEWSLETTER_READ, one, oneOf, PAGE_SIZE, pickText } from "@/lib/engage";
import {
  adRules,
  CAMPAIGN_BADGE,
  CAMPAIGN_STATUSES,
  type Campaign,
  type NewsletterList,
} from "@/lib/newsletter";
import { loadNewsletterSettings } from "@/lib/newsletter-server";
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter";

// Tab "Chiến dịch": mọi chiến dịch, mới nhất trước, lọc theo trạng thái và danh sách nhận tin.
// Số liệu là số thật của core (đã gửi, lỗi, bỏ qua); module không đo lượt mở hay bấm.
export default async function CampaignsPage(props: PageProps<"/marketing/newsletter">) {
  if (!(await can(NEWSLETTER_READ))) redirect(`${BASE}/data`);
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  const params = await props.searchParams;
  const status = oneOf(params, "status", CAMPAIGN_STATUSES);
  const list = one(params, "list");
  const cursor = one(params, "cursor", 500);
  let page: { data: Campaign[]; pagination: { next_cursor?: string | null } };
  let lists: NewsletterList[];
  try {
    [page, { data: lists }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/newsletter/campaigns", {
          params: {
            query: {
              limit: PAGE_SIZE,
              ...(status ? { status } : {}),
              ...(list ? { list_id: list } : {}),
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
  const names = new Map(lists.map((l) => [l.id, pickText(l.name, locale) || l.key]));
  const settings = await loadNewsletterSettings();
  const ads = adRules(settings);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("campaignDeleted")} /> : null}
      <SendSetup settings={settings} />
      <p className="note">
        <b>{t("noTracking")}</b> {t("noTrackingAbout")}
      </p>
      <section className="block" aria-labelledby="camp-h">
        <div className="block-head">
          <h2 id="camp-h" className="h2">
            {t("campaigns")}
          </h2>
        </div>
        <Chips
          label={t("filterStatus")}
          chips={[
            { href: hrefWith(BASE, { list }), label: t("all"), on: !status },
            ...CAMPAIGN_STATUSES.map((s) => ({
              href: hrefWith(BASE, { status: s, list }),
              label: t(`status.${s}`),
              on: status === s,
            })),
          ]}
        />
        {lists.length > 1 ? (
          <form method="get" action={BASE} className="filters">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <label className="fld">
              <span className="lab">{t("list")}</span>
              <select className="inp" name="list" defaultValue={list ?? ""}>
                <option value="">{t("allLists")}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {names.get(l.id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("apply")}
              </button>
            </div>
          </form>
        ) : null}
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{status || list ? t("noMatch") : t("noCampaigns")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.subject")}</Th>
                  <Th>{t("col.list")}</Th>
                  <Th>{t("col.sent")}</Th>
                  <Th>{t("col.failed")}</Th>
                  <Th>{t("col.skipped")}</Th>
                  <Th>{t("col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((c) => (
                  <tr key={c.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link className="open ell" href={`${BASE}/campaigns/${c.id}`}>
                          {c.subject}
                        </Link>
                        <span className="sub">
                          {c.advertising ? (
                            <span className="tag">{t("advertisingTag")}</span>
                          ) : null}{" "}
                          {c.scheduled_at && c.status === "scheduled" ? (
                            <>
                              {t("scheduledFor")} <Time value={c.scheduled_at} />
                            </>
                          ) : c.finished_at ? (
                            <>
                              {t("finished")} <Time value={c.finished_at} />
                            </>
                          ) : (
                            <>
                              {t("updated")} <Time value={c.updated_at} />
                            </>
                          )}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("col.list")}>{names.get(c.list_id) ?? "—"}</Td>
                    <Td className="tabular-nums" label={t("col.sent")}>
                      {count(c.progress.sent, locale)} / {count(c.progress.total, locale)}
                    </Td>
                    <Td className="tabular-nums" label={t("col.failed")}>
                      {count(c.progress.failed, locale)}
                    </Td>
                    <Td className="tabular-nums" label={t("col.skipped")}>
                      {count(c.progress.skipped, locale)}
                    </Td>
                    <Td label={t("col.status")}>
                      <span className={CAMPAIGN_BADGE[c.status]}>
                        <span className="dot" />
                        {t(`status.${c.status}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { status, list }) : null}
          next={next ? hrefWith(BASE, { status, list, cursor: next }) : null}
        />
      </section>
      <p className="note warn">{t("adsLaw", { label: ads.label, max: ads.maxPerDay })}</p>
    </div>
  );
}
