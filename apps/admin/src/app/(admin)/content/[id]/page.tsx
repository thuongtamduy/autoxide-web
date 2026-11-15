import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EntryEditor } from "@/components/content/editor";
import { MessagePanel } from "@/components/message-panel";
import { abilities } from "@/lib/content";
import { loadAi, loadAuthors, loadEntry, loadTerms, optional } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { getMe } from "@/lib/viewer";

// Trình soạn một bài: đọc bài (kèm ETag), và mọi thứ thanh bên cần, song song. Phần phụ (lịch,
// phiên bản, SEO, bản dịch) lỗi thì thanh bên báo "chưa xem được", trình soạn vẫn mở.
export default async function EntryPage(props: PageProps<"/content/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const me = await getMe();

  let found: Awaited<ReturnType<typeof loadEntry>>;
  try {
    found = await loadEntry(id);
  } catch (error) {
    if (isForbidden(error)) {
      const t = await getTranslations("errors");
      return (
        <MessagePanel
          title={t("forbiddenTitle")}
          message={t("forbidden", { permission: "content.read" })}
        />
      );
    }
    throw error;
  }
  if (!found) notFound();
  const { entry, version } = found;
  const path = { params: { path: { id } } };

  const [authors, terms, ai, schedules, revisions, findings, translations, requests] =
    await Promise.all([
      loadAuthors(),
      loadTerms(),
      loadAi(),
      optional(load((c) => c.GET("/api/v1/content/entries/{id}/schedules", path))),
      optional(
        load((c) =>
          c.GET("/api/v1/content/entries/{id}/revisions", {
            params: { path: { id }, query: { limit: 30 } },
          }),
        ),
      ),
      optional(load((c) => c.GET("/api/v1/content/entries/{id}/seo-check", path))),
      optional(
        load((c) =>
          c.GET("/api/v1/content/entries", {
            params: { query: { translation_group_id: entry.translation_group_id, limit: 50 } },
          }),
        ),
      ),
      optional(
        load((c) =>
          c.GET("/api/v1/content/entries/{id}/translation-requests", {
            params: { path: { id }, query: { limit: 10 } },
          }),
        ),
      ),
    ]);

  return (
    <EntryEditor
      // Đổi bài (vd mở bản dịch) thì dựng lại trình soạn từ đầu.
      key={entry.id}
      entry={entry}
      version={version}
      can={abilities(me)}
      ai={ai}
      authors={authors}
      terms={terms}
      schedules={schedules?.data ?? []}
      revisions={revisions?.data ?? []}
      findings={findings?.data.findings ?? null}
      translations={(translations?.data ?? []).filter((other) => other.id !== entry.id)}
      requests={requests?.data ?? []}
      // Core đặt đầu đường dẫn bằng AUTOXIDE_CONTENT_POST_PATH_PREFIX (mặc định `blog`) nhưng
      // chưa có API đọc nó: dùng giá trị mặc định.
      pathPrefix="/blog/"
    />
  );
}
