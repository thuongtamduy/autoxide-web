import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  bulkMoveMedia,
  bulkPurgeMedia,
  bulkRestoreMedia,
  bulkTrashMedia,
  purgeMedia,
  restoreMedia,
  trashMedia,
} from "@/app/(admin)/content/media/actions";
import { Icon, type IconName } from "@/components/shell/icon";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
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
  mediaKeep,
  mediaSort,
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

/**
 * Bảng tệp (máy tính); trên điện thoại thành thẻ có nhãn cột. Chọn nhiều để chuyển thư mục / cho vào
 * thùng rác (thùng rác: khôi phục / xoá hẳn) — core chỉ có lệnh từng tệp nên thanh hàng loạt lặp từng
 * cái. Mỗi dòng có "⋯" (mở chi tiết, thùng rác…). Sắp theo tên, kích thước, giờ tải lên (`sort` của core).
 */
export function MediaTable({
  items,
  filters,
  folders,
  can = { write: false, purge: false },
}: {
  items: MediaItem[];
  filters: MediaFilters;
  folders: MediaFolder[];
  can?: { write: boolean; purge: boolean };
}) {
  const t = useTranslations("media");
  const tt = useTranslations("table");
  const locale = useLocale();
  const folderName = (id: string | null | undefined) =>
    id ? (folders.find((f) => f.id === id)?.name ?? "—") : t("folders.root");
  const sort = mediaSort(filters);
  const keep = mediaKeep(filters);
  const trash = Boolean(filters.trash);
  const actions: BulkActionSpec[] = [];
  if (can.write && !trash) {
    actions.push(
      {
        key: "move",
        label: t("bulk.move"),
        run: bulkMoveMedia,
        field: {
          label: t("detail.folder"),
          options: [
            { value: "root", label: t("folders.root") },
            ...folders.map((f) => ({ value: f.id, label: f.name })),
          ],
        },
      },
      {
        key: "trash",
        label: t("detail.trash"),
        tone: "danger",
        run: bulkTrashMedia,
        confirm: {
          title: t("bulk.trashTitle"),
          points: [t("detail.trashLink"), t("detail.trashUsage"), t("detail.trashRestore")],
          submit: t("detail.trash"),
        },
      },
    );
  }
  if (can.write && trash) {
    actions.push({ key: "restore", label: t("detail.restore"), run: bulkRestoreMedia });
  }
  if (can.purge && trash) {
    actions.push({
      key: "purge",
      label: t("detail.purge"),
      tone: "danger",
      run: bulkPurgeMedia,
      confirm: {
        title: t("bulk.purgeTitle"),
        points: [t("detail.purgeForever")],
        submit: t("detail.purge"),
      },
    });
  }
  const selectable = actions.length > 0;
  const menu = (item: MediaItem): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: t("bulk.open"), href: mediaHref(filters, { item: item.id }) },
    ];
    if (can.write && !item.trashed_at) {
      items.push({
        label: t("detail.trash"),
        danger: true,
        dialog: (
          <ConfirmAction
            action={trashMedia}
            id={item.id}
            label={t("detail.trash")}
            title={t("detail.trashTitle", { name: item.name })}
            points={[t("detail.trashLink"), t("detail.trashUsage"), t("detail.trashRestore")]}
            submit={t("detail.trash")}
            done={t("detail.trashed")}
          />
        ),
      });
    }
    if (can.write && item.trashed_at) {
      items.push({
        label: t("detail.restore"),
        dialog: (
          <ConfirmAction
            action={restoreMedia}
            id={item.id}
            label={t("detail.restore")}
            title={t("bulk.restoreTitle", { name: item.name })}
            points={[t("bulk.restorePoint")]}
            submit={t("detail.restore")}
            done={t("detail.restored")}
            danger={false}
          />
        ),
      });
    }
    if (can.purge && item.trashed_at) {
      items.push({
        label: t("detail.purge"),
        danger: true,
        dialog: (
          <ConfirmAction
            action={purgeMedia}
            id={item.id}
            label={t("detail.purge")}
            title={t("detail.purgeTitle", { name: item.name })}
            points={[t("detail.purgeForever")]}
            submit={t("detail.purge")}
            done={t("bulk.purged")}
          />
        ),
      });
    }
    return items;
  };
  return (
    <BulkTable ids={items.map((item) => item.id)} actions={actions}>
      <Table cards>
        <thead>
          <tr>
            {selectable ? <SelectAllTh /> : null}
            <SortTh field="name" sort={sort} base="/content/media" keep={keep}>
              {t("table.file")}
            </SortTh>
            <Th>{t("table.type")}</Th>
            <Th>{t("table.dimensions")}</Th>
            <SortTh
              field="size"
              sort={sort}
              base="/content/media"
              keep={keep}
              first="desc"
              className="text-right"
            >
              {t("table.size")}
            </SortTh>
            <Th>{t("table.alt")}</Th>
            <SortTh field="created" sort={sort} base="/content/media" keep={keep} first="desc">
              {t("table.uploaded")}
            </SortTh>
            <Th>
              <span className="vh">{t("bulk.actions")}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-current={filters.item === item.id ? "" : undefined}>
              {selectable ? <SelectTd id={item.id} name={item.name} /> : null}
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
                ) : item.decorative ? (
                  <span className="badge b-draft">{t("badges.decorative")}</span>
                ) : (
                  <span className="ell">{item.alt || "—"}</span>
                )}
              </Td>
              <Td label={t("table.uploaded")} className="whitespace-nowrap">
                <span className="cell2">
                  <Time value={item.created_at} />
                  {item.uploaded_by_name ? (
                    <span className="sub ell">{item.uploaded_by_name}</span>
                  ) : null}
                </span>
              </Td>
              <Td label={t("bulk.actions")}>
                <RowMenu label={tt("moreFor", { name: item.name })} items={menu(item)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </BulkTable>
  );
}
