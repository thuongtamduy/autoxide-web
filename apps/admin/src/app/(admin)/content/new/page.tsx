import { getLocale, getTranslations } from "next-intl/server";
import { NewEntryForm } from "@/components/content/new-entry";
import { MessagePanel } from "@/components/message-panel";
import { contentLocaleFor } from "@/lib/client-config";
import { abilities } from "@/lib/content";
import { optional } from "@/lib/content-server";
import { load } from "@/lib/core";
import { getMe } from "@/lib/viewer";

// Bài viết mới (`/content/new`) hay trang mới (`/content/new?kind=page`). Tạo xong thì mở trình
// soạn của bài vừa tạo; mọi thứ khác (SEO, tác giả, đăng) làm ở đó.
export default async function NewEntryPage(props: PageProps<"/content/new">) {
  const t = await getTranslations();
  const { kind } = await props.searchParams;
  const me = await getMe();
  if (!abilities(me).write) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", { permission: "content.write" })}
      />
    );
  }
  const isPage = kind === "page";
  const uiLocale = await getLocale();
  const locale = await contentLocaleFor(uiLocale);
  // Trang cha: mọi trang (một trang 200 bài); core kiểm độ sâu và vòng lặp.
  const pages = isPage
    ? await optional(
        load((c) =>
          c.GET("/api/v1/content/entries", {
            params: { query: { kind: "page", limit: 200, sort: "updated_at" } },
          }),
        ),
      )
    : null;
  return (
    <NewEntryForm
      kind={isPage ? "page" : "post"}
      defaultLocale={locale}
      parents={(pages?.data ?? []).map((p) => ({ id: p.id, title: p.title, locale: p.locale }))}
    />
  );
}
