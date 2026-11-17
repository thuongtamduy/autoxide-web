import { getLocale, getTranslations } from "next-intl/server";
import { createCampaign } from "@/app/(admin)/marketing/newsletter/actions";
import { CampaignEditor } from "@/components/engage/campaign-editor";
import { Back, Forbidden, PageHead } from "@/components/engage/common";
import { isForbidden, load } from "@/lib/core";
import { NEWSLETTER_MANAGE, one, pickText } from "@/lib/engage";
import { adRules, type NewsletterList } from "@/lib/newsletter";
import { loadNewsletterSettings } from "@/lib/newsletter-server";
import { can, getCurrentTenant } from "@/lib/viewer";

// Soạn chiến dịch mới: lưu thành bản nháp, chưa gửi gì. Gửi thử, hẹn giờ, gửi ở trang của nó
// (các lệnh đó của core cần id chiến dịch, nên chỉ có sau khi lưu nháp).
export default async function NewCampaignPage(
  props: PageProps<"/marketing/newsletter/campaigns/new">,
) {
  if (!(await can(NEWSLETTER_MANAGE))) return <Forbidden permission={NEWSLETTER_MANAGE} />;
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  const params = await props.searchParams;
  let lists: NewsletterList[];
  try {
    ({ data: lists } = await load((client) =>
      client.GET("/api/v1/newsletter/lists", { params: { query: { limit: 200 } } }),
    ));
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_MANAGE} />;
    throw error;
  }
  const wanted = one(params, "list");
  const [settings, tenant] = await Promise.all([loadNewsletterSettings(), getCurrentTenant()]);
  return (
    <div className="page">
      <Back href="/marketing/newsletter" label={t("back")} />
      <PageHead crumb={t("crumb")} title={t("newTitle")} description={t("newAbout")} />
      {lists.length === 0 ? (
        <p className="note">{t("needList")}</p>
      ) : (
        <CampaignEditor
          action={createCampaign}
          submit={t("editor.create")}
          ads={adRules(settings)}
          sender={tenant?.name || t("editor.senderFallback")}
          note={t("editor.draftNote")}
          cancelHref="/marketing/newsletter"
          lists={lists.map((l) => ({
            id: l.id,
            name: pickText(l.name, locale) || l.key,
            confirmed: l.subscriptions.confirmed,
          }))}
          initial={{
            listId:
              lists.find((l) => l.id === wanted)?.id ??
              (lists.length === 1 ? (lists[0]?.id ?? "") : ""),
            subject: "",
            preheader: "",
            locale: locale === "en" ? "en" : "vi",
            advertising: false,
            bodyText: "",
            bodyHtml: "",
          }}
        />
      )}
    </div>
  );
}
