import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EntryEditor } from "@/components/content/editor";
import { MessagePanel } from "@/components/message-panel";
import { getClientConfig } from "@/lib/client-config";
import { abilities, postPathPrefix } from "@/lib/content";
import { loadAi, loadAuthors, loadEntry, loadTerms, optional } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { MEDIA_READ, MEDIA_WRITE } from "@/lib/permissions";
import { can, getMe } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { entryWebsite, listWebsites } from "@/sample/content";

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

  // Ảnh đang gắn với bài (tên, công khai hay chưa), quyền dùng thư viện media, AI đọc ảnh.
  const mediaIds = [entry.featured_media_id, entry.og_media_id].filter(
    (value): value is string => typeof value === "string",
  );
  const [mediaItems, canMedia, canUpload] = await Promise.all([
    Promise.all(
      [...new Set(mediaIds)].map((mediaId) =>
        optional(load((c) => c.GET("/api/v1/media/{id}", { params: { path: { id: mediaId } } }))),
      ),
    ),
    can(MEDIA_READ),
    can(MEDIA_WRITE),
  ]);
  const [aiStatus, config] = await Promise.all([
    canMedia ? optional(load((c) => c.GET("/api/v1/ai/status"))) : null,
    getClientConfig(),
  ]);

  // Bài thuộc website nào: dữ liệu mẫu (W-006), core chưa có API.
  const sample = sampleDataEnabled()
    ? {
        websites: (await listWebsites()).data,
        current: (await entryWebsite(entry.id)).data.website_id,
      }
    : null;

  return (
    <EntryEditor
      // Đổi bài (vd mở bản dịch) thì dựng lại trình soạn từ đầu.
      key={entry.id}
      entry={entry}
      version={version}
      can={abilities(me)}
      ai={ai}
      authors={authors.items}
      terms={terms.items}
      more={{ authors: authors.more, terms: terms.more }}
      schedules={schedules?.data ?? []}
      revisions={revisions?.data ?? []}
      findings={findings?.data.findings ?? null}
      translations={(translations?.data ?? []).filter((other) => other.id !== entry.id)}
      requests={requests?.data ?? []}
      // Đầu đường dẫn của bài viết do người vận hành đặt (`GET /kernel/client-config`);
      // core cũ chưa có endpoint thì dùng giá trị mặc định của core.
      pathPrefix={postPathPrefix(config?.content?.post_path_prefix)}
      sample={sample}
      media={{
        available: canMedia,
        canUpload,
        aiAlt: Boolean(aiStatus?.data.enabled && aiStatus.data.images),
        items: mediaItems.flatMap((answer) => (answer ? [answer.data] : [])),
      }}
    />
  );
}
