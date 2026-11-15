import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/shell/icon";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  extOf,
  formatBytes,
  isRaster,
  kindOf,
  type MediaFilters,
  type MediaFolder,
  type MediaItem,
  mediaHref,
  mediaSrc,
  missingAlt,
} from "@/lib/media";

const KIND_ICON: Record<ReturnType<typeof kindOf>, IconName> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "file",
  other: "file",
};

/** Ô xem trước của một tệp: ảnh thật (bản nhỏ) cho ảnh raster, biểu tượng và đuôi tệp cho loại khác. */
export function MediaThumb({ item, width = 320 }: { item: MediaItem; width?: number }) {
  if (isRaster(item.content_type) && !item.trashed_at) {
    return (
      // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên), không qua bộ tối ưu ảnh của Next.js
      <img
        className="md-thumb"
        src={mediaSrc(item, width)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className={`md-thumb md-ph k-${kindOf(item.content_type)}`} aria-hidden="true">
      <Icon name={KIND_ICON[kindOf(item.content_type)]} />
      <span className="mono">{extOf(item)}</span>
    </span>
  );
}

function meta(item: MediaItem, locale: string): string {
  const size = formatBytes(item.size, locale);
  return item.width && item.height ? `${item.width} × ${item.height} · ${size}` : size;
}

/** Lưới tệp: mỗi ô là link mở khung chi tiết (`?item=`). */
export function MediaGrid({ items, filters }: { items: MediaItem[]; filters: MediaFilters }) {
  const t = useTranslations("media");
  const locale = useLocale();
  return (
    <ul className="md-grid">
      {items.map((item) => {
        const on = filters.item === item.id;
        return (
          <li key={item.id}>
            <Link
              className={on ? "md-tile sel" : "md-tile"}
              href={mediaHref(filters, { item: item.id })}
              aria-current={on ? "true" : undefined}
              scroll={false}
            >
              <MediaThumb item={item} />
              <span className="md-tile-body">
                <span className="ell md-name">{item.name}</span>
                <span className="num ell md-meta">{meta(item, locale)}</span>
                <span className="md-badges">
                  {missingAlt(item) ? (
                    <span className="badge b-warn">{t("badges.noAlt")}</span>
                  ) : null}
                  {item.visibility === "private" ? (
                    <span className="badge b-draft">{t("badges.private")}</span>
                  ) : null}
                  {item.trashed_at ? (
                    <span className="badge b-arch">{t("badges.trashed")}</span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Bảng tệp (máy tính); trên điện thoại thành thẻ có nhãn cột. */
export function MediaTable({
  items,
  filters,
  folders,
}: {
  items: MediaItem[];
  filters: MediaFilters;
  folders: MediaFolder[];
}) {
  const t = useTranslations("media");
  const locale = useLocale();
  const folderName = (id: string | null | undefined) =>
    id ? (folders.find((f) => f.id === id)?.name ?? "—") : t("folders.root");
  return (
    <Table cards>
      <thead>
        <tr>
          <Th>{t("table.file")}</Th>
          <Th>{t("table.type")}</Th>
          <Th>{t("table.dimensions")}</Th>
          <Th className="text-right">{t("table.size")}</Th>
          <Th>{t("table.alt")}</Th>
          <Th>{t("table.uploaded")}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} data-current={filters.item === item.id ? "" : undefined}>
            <Td className="rt-title">
              <span className="cell2">
                <Link
                  className="open mono ell"
                  href={mediaHref(filters, { item: item.id })}
                  scroll={false}
                >
                  {item.name}
                </Link>
                <span className="sub">{folderName(item.folder_id)}</span>
              </span>
            </Td>
            <Td label={t("table.type")}>
              <span className="mono">{item.content_type}</span>
            </Td>
            <Td label={t("table.dimensions")} className="num">
              {item.width && item.height ? `${item.width} × ${item.height}` : "—"}
            </Td>
            <Td label={t("table.size")} className="num text-right">
              {formatBytes(item.size, locale)}
            </Td>
            <Td label={t("table.alt")}>
              {missingAlt(item) ? (
                <span className="badge b-warn">{t("badges.noAlt")}</span>
              ) : (
                <span className="ell">{item.alt || "—"}</span>
              )}
            </Td>
            <Td label={t("table.uploaded")} className="whitespace-nowrap">
              <Time value={item.created_at} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
