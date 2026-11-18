import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BodyView } from "@/components/body-view";
import type { Locale } from "@/i18n/routing";
import { outline } from "@/lib/body";
import { getPreview } from "@/lib/content";

// Xem trước bản nháp theo link có token (trình soạn của trang quản trị tạo link
// `<website>/preview?token=…`). Không cần đăng nhập; không vào chỉ mục. Bản nháp chỉ có id của ảnh,
// nên ảnh trong thân bài tải qua route media của website (ảnh công khai mới hiện được).

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage(props: PageProps<"/[locale]/preview">) {
  const locale = (await props.params).locale as Locale;
  const { token } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "preview" });
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  let draft = null;
  if (value) {
    try {
      draft = (await getPreview(locale, value))?.data ?? null;
    } catch {
      draft = null;
    }
  }
  if (!draft) {
    return (
      <main id="main" className="wrap page-msg">
        <h1 className="dsp">{t("title")}</h1>
        <p role="alert" className="muted">
          {t("invalid")}
        </p>
      </main>
    );
  }
  const { body } = outline(draft.body);
  // Ảnh của bản nháp: dựng `PublicMedia` tối thiểu từ id (không có bản thu nhỏ).
  const media = collectImageIds(draft.body).map((id) => ({
    id,
    url: `/api/v1/media/${id}/content`,
    alt: "",
    alt_ai_assisted: false,
    variants: [],
  }));
  return (
    <main id="main" className="ar-pg">
      <p className="preview-banner" role="note">
        {t("banner")}
      </p>
      <header className="wrap ar-wrap ar-head">
        <h1 className="dsp ar-title" lang={draft.locale}>
          {draft.title}
        </h1>
        {draft.excerpt ? <p className="ar-lead">{draft.excerpt}</p> : null}
      </header>
      <div className="wrap ar-wrap">
        <article className="ar-body" lang={draft.locale}>
          <BodyView body={body} media={media} locale={locale} />
        </article>
      </div>
    </main>
  );
}

function collectImageIds(node: {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: unknown[] | null;
}): string[] {
  const own =
    node.type === "image" &&
    typeof node.attrs?.mediaId === "string" &&
    /^[0-9a-f-]{36}$/i.test(node.attrs.mediaId)
      ? [node.attrs.mediaId]
      : [];
  const kids = (node.content ?? []) as (typeof node)[];
  return [...own, ...kids.flatMap(collectImageIds)];
}
