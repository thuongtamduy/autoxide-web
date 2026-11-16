import { useTranslations } from "next-intl";
import type { Entry, EntryStatus } from "@/lib/content";

/** Lớp màu của nhãn trạng thái. */
export function statusClass(status: EntryStatus): string {
  return status === "published" ? "badge b-ok" : status === "draft" ? "badge b-draft" : "badge";
}

/** Nhãn trạng thái của một bài, kèm "chờ duyệt" khi người viết đã gửi duyệt. */
export function EntryStatusBadges({ entry }: { entry: Entry }) {
  const t = useTranslations("content.status");
  return (
    <span className="ce-badges">
      <span className={statusClass(entry.status)}>
        <span className="dot" />
        {t(entry.status)}
      </span>
      {entry.review_requested_at ? (
        <span className="badge b-warn">
          <span className="dot" />
          {t("review")}
        </span>
      ) : null}
      {entry.status === "published" && entry.has_unpublished_changes ? (
        <span className="badge b-info">{t("changed")}</span>
      ) : null}
    </span>
  );
}
