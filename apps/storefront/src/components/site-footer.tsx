import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { loadOptional } from "@/lib/core";
import { footerColumns } from "@/lib/menu";
import { loadMenu } from "@/lib/menus-server";
import type { SiteIdentity } from "@/lib/site";
import { Icon } from "./icon";
import { LanguageSwitch } from "./language-switch";
import { NavAnchor } from "./nav-link";
import { NewsletterForm } from "./newsletter-form";
import { SampleMark } from "./sample-mark";

// Chân trang: đăng ký bản tin (module `newsletter` thật), cột link từ menu `footer` của core, thông
// tin pháp lý theo luật thương mại điện tử Việt Nam (NĐ 52/2013/NĐ-CP, sửa bởi NĐ 85/2021/NĐ-CP:
// website bán hàng công bố tên, địa chỉ, mã số thuế, điện thoại, email của chủ website và gắn logo
// "Đã thông báo Bộ Công Thương" — cần đối chiếu văn bản gốc). Core chưa có hồ sơ công khai của khách
// (bước 34) nên các ô thông tin là chỗ trống `[…]` (repo công khai: không ghi dữ liệu thật).

export async function SiteFooter({ locale, site }: { locale: Locale; site: SiteIdentity }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tn = await getTranslations({ locale, namespace: "newsletter" });
  const footer = await loadMenu("footer", locale);
  const columns = footerColumns(footer.menu?.items ?? []);
  const lists = await loadOptional(locale, (client) =>
    client.GET("/api/v1/newsletter/public/lists", { params: { query: { locale } } }),
  );
  const publicLists = lists?.data.lists ?? [];
  const year = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  });

  return (
    <footer className="ftr">
      <div className="wrap ftr-in">
        <div className="fcols">
          <div className="fbrand">
            <span className="fbrand-name">
              <span className="mark">
                <Icon name="leaf" />
              </span>
              <span className="dsp">{site.name}</span>
            </span>
            {publicLists.length > 0 && lists ? (
              <>
                <span className="ftr-lead">{tn("lead", { blog: site.blogName })}</span>
                <NewsletterForm
                  locale={locale}
                  tokenScope={lists.data.token_scope}
                  lists={publicLists.map((list) => ({
                    key: list.key,
                    name: list.name,
                    doubleOptIn: list.double_opt_in,
                  }))}
                  labels={{
                    email: tn("email"),
                    placeholder: tn("placeholder"),
                    submit: tn("submit"),
                    consent: tn("consent"),
                    lists: tn("lists"),
                  }}
                />
              </>
            ) : (
              <span className="ftr-lead">{t("about")}</span>
            )}
          </div>
          {columns.map((column, index) => (
            <div className="fcol" key={column.heading ?? `c${index}`}>
              <span className="fcol-h">
                {column.heading ?? t("links")}
                {footer.sample && index === 0 ? <SampleMark note={t("sampleMenu")} /> : null}
              </span>
              {column.links.map((link) => (
                <NavAnchor key={link.href + link.label} link={link} />
              ))}
            </div>
          ))}
        </div>
        <div className="ftr-legal">
          <p>{t("legal")}</p>
          <span className="moit">
            <Icon name="shield" />
            <span>{t("moit")}</span>
          </span>
        </div>
        <div className="ftr-base">
          <span>{t("copyright", { year, name: site.name })}</span>
          <span>{t("poweredBy")}</span>
          <a className="ftr-rss" href={locale === "vi" ? "/feed.xml" : `/${locale}/feed.xml`}>
            <Icon name="rss" small />
            {t("rss")}
          </a>
          <span className="ftr-gap" />
          <LanguageSwitch
            current={locale}
            label={t("language")}
            names={{ vi: "Tiếng Việt", en: "English" }}
          />
        </div>
      </div>
    </footer>
  );
}
