"use client";

// Phần của màn Nội dung dùng dữ liệu mẫu (W-006): chọn website theo tên miền, trang bắt buộc
// của website, bài thuộc website nào. Mỗi khối có nhãn `SampleBadge` ghi endpoint còn thiếu.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { draftRequiredPage, moveToWebsite } from "@/app/(admin)/content/sample-actions";
import { TipHeading } from "@/components/help/info-tip";
import { SampleBadge } from "@/components/sample-badge";
import { useToast } from "@/components/ui/toast";
import type { Checklist, Website } from "@/sample/content";

/** Chọn website: đổi khối "Trang bắt buộc"; danh sách bài vẫn hiện mọi bài (chưa gắn website). */
export function SiteChips({
  websites,
  current,
  hrefFor,
}: {
  websites: Website[];
  current: string;
  hrefFor: Record<string, string>;
}) {
  const t = useTranslations("content.sample");
  return (
    <section className="ce-sites" aria-labelledby="ce-sites-h">
      <div className="block-head">
        <TipHeading id="ce-sites-h" tip="websites" className="cap">
          {t("sites")}
        </TipHeading>
        <SampleBadge step="37" endpoint="GET /api/v1/compliance/websites" />
      </div>
      <div className="ce-sitechips">
        {websites.map((site) => (
          <Link
            key={site.id}
            href={hrefFor[site.id] ?? "/content"}
            className={site.id === current ? "ce-site on" : "ce-site"}
            aria-current={site.id === current ? "true" : undefined}
          >
            <span className="mono">{site.domain}</span>
            <span className="ce-site-owner">
              {site.org.name} · {t(site.website_kind === "sales" ? "kindSales" : "kindPlatform")}
            </span>
          </Link>
        ))}
      </div>
      <p className="fhint">{t("sitesNote")}</p>
    </section>
  );
}

/** Trang bắt buộc theo luật của website đang chọn (danh sách kiểm của bước 37). */
export function RequiredPages({ website, checklist }: { website: Website; checklist: Checklist }) {
  const t = useTranslations("content.sample");
  const toast = useToast();
  const [pending, start] = useTransition();
  const done = checklist.pages.filter((p) => p.status === "published").length;
  const full = done === checklist.pages.length;
  return (
    <section className="card ce-required" aria-labelledby="ce-req-h">
      <div className="block-head">
        <TipHeading id="ce-req-h" tip="required_pages">
          {t("required")}
        </TipHeading>
        <span className={full ? "badge b-ok" : "badge b-warn"}>
          <span className="dot" />
          {t("summary", { done, total: checklist.pages.length })}
        </span>
      </div>
      <SampleBadge
        step="37"
        endpoint="GET /api/v1/compliance/websites/{id}/checklist, POST /api/v1/content/templates/{key}/drafts"
      />
      <p className="fhint">
        {t(website.website_kind === "sales" ? "requiredSales" : "requiredPlatform")}
      </p>
      <ul className="ce-checklist">
        {checklist.pages.map((page) => (
          <li key={page.page_kind} className={`ce-req ${page.status}`}>
            <span
              className={`sq-ic ${page.status === "published" ? "ok" : page.status === "draft" ? "warn" : "bad"}`}
            >
              {page.status === "published" ? "✓" : page.status === "draft" ? "–" : "×"}
            </span>
            <span className="ce-row-main">
              <span>{t(`pages.${page.page_kind}`)}</span>
              <span className="ce-muted">
                {page.template ? t(`state.${page.status}`) : t("configuredElsewhere")}
              </span>
            </span>
            {page.status === "missing" && page.template ? (
              <button
                type="button"
                className="btn sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await draftRequiredPage(website.id, page.page_kind);
                    toast(result.ok ? t("drafted") : result.problem.detail);
                  })
                }
              >
                {t("fromTemplate")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Thanh bên của trình soạn: bài thuộc website nào (chưa có API). */
export function EntryWebsitePicker({
  entryId,
  websites,
  current,
  disabled,
}: {
  entryId: string;
  websites: Website[];
  current: string;
  disabled: boolean;
}) {
  const t = useTranslations("content.sample");
  const toast = useToast();
  const [pending, start] = useTransition();
  const site = websites.find((w) => w.id === current);
  return (
    <section className="ce-sec" aria-labelledby="ce-web-h">
      <div className="block-head">
        <h3 id="ce-web-h" className="cap">
          {t("website")}
        </h3>
        <SampleBadge
          step="37"
          endpoint="PUT /api/v1/content/entries/{id}/website (not planned yet)"
        />
      </div>
      <fieldset className="ce-picks" aria-labelledby="ce-web-h">
        {websites.map((w) => (
          <label key={w.id} className="ce-chip ce-pick">
            <input
              type="radio"
              name="website"
              checked={w.id === current}
              disabled={disabled || pending}
              onChange={() =>
                start(async () => {
                  const result = await moveToWebsite(entryId, w.id);
                  toast(result.ok ? t("moved", { domain: w.domain }) : result.problem.detail);
                })
              }
            />
            <span className="mono">{w.domain}</span>
          </label>
        ))}
      </fieldset>
      {site ? <p className="fhint">{t("owner", { owner: site.org.name })}</p> : null}
    </section>
  );
}
