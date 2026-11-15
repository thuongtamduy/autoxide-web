import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BodyView } from "@/components/content/body-view";
import { anonymousClient } from "@/lib/core";
import "@/components/content/content.css";

// Trang xem trước bản nháp cho người không có tài khoản: ai có link (token do trình soạn tạo)
// đều xem được tới khi token hết hạn. Gọi endpoint công khai của core, không cần đăng nhập, nên
// proxy không đòi phiên ở đường dẫn này. Website thật có trang xem trước của riêng nó; trang
// này để người soạn gửi link ngay khi website chưa có (core chưa có API cho địa chỉ website).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage(props: PageProps<"/preview">) {
  const t = await getTranslations("content.preview");
  const { token } = await props.searchParams;
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  let draft = null;
  if (value) {
    try {
      const client = await anonymousClient();
      const { data } = await client.GET("/api/v1/content/public/preview", {
        params: { query: { token: value } },
      });
      draft = data?.data ?? null;
    } catch {
      draft = null;
    }
  }
  return (
    <main className="ax ce-preview">
      <div className="ce-preview-inner">
        <p className="ce-preview-banner" role="note">
          {t("banner")}
        </p>
        {draft ? (
          <article lang={draft.locale}>
            <h1 className="h1">{draft.title}</h1>
            {draft.excerpt ? <p className="ce-preview-excerpt">{draft.excerpt}</p> : null}
            <BodyView body={draft.body} />
            {draft.ai_generated ? <p className="fhint">{t("aiNotice")}</p> : null}
          </article>
        ) : (
          <p role="alert" className="note warn">
            {t("invalid")}
          </p>
        )}
      </div>
    </main>
  );
}
