import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { loadChrome } from "@/lib/core";
import { loadLegal } from "@/lib/legal-server";
import { footerColumns } from "@/lib/menu";
import { loadMenu } from "@/lib/menus-server";
import type { SiteIdentity } from "@/lib/site";
import { Icon } from "./icon";
import { LanguageSwitch } from "./language-switch";
import { NavAnchor } from "./nav-link";
import { NewsletterForm } from "./newsletter-form";
import { SampleMark } from "./sample-mark";

// Chân trang: đăng ký bản tin (module `newsletter` thật), cột link từ menu `footer` của core, thông
// tin pháp lý theo luật thương mại điện tử Việt Nam (NĐ 52/2013/NĐ-CP, sửa bởi NĐ 85/2021/NĐ-CP — cần
// đối chiếu văn bản gốc) lấy từ hồ sơ pháp lý của core, và logo Bộ Công Thương khi core xác nhận
// website đã thông báo / đăng ký (W-060). Chưa có hồ sơ thì không in dòng pháp lý (`lib/legal-server.ts`).

export async function SiteFooter({ locale, site }: { locale: Locale; site: SiteIdentity }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tn = await getTranslations({ locale, namespace: "newsletter" });
  const footer = await loadMenu("footer", locale);
  const columns = footerColumns(footer.menu?.items ?? []);
  const lists = await loadChrome(locale, (client) =>
    client.GET("/api/v1/newsletter/public/lists", { params: { query: { locale } } }),
  );
  const publicLists = lists?.data.lists ?? [];
  const legal = await loadLegal(locale);
  const owner = legal.owner;
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
        {owner ? (
          <div className="ftr-legal">
            <p>
              {[owner.name, ...owner.facts.map((fact) => t(`owner.${fact.key}`, fact.values))].join(
                " · ",
              )}
              {legal.sample ? <SampleMark note={t("sampleLegal")} /> : null}
            </p>
            {legal.badge ? (
              <a className="moit" href={legal.badge.href} target="_blank" rel="noopener noreferrer">
                {/* Ảnh của cơ quan cấp, không qua bộ tối ưu ảnh của Next.js (máy chủ ảnh bên ngoài). */}
                <Image
                  src={legal.badge.src}
                  alt={legal.badge.alt}
                  width={150}
                  height={57}
                  unoptimized
                />
              </a>
            ) : null}
          </div>
        ) : null}
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
