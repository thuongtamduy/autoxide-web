"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/shell/icon";
import { DropZone } from "./uploader";

/** Nút "Tải lên" ở đầu trang: mở ô chọn tệp của vùng kéo thả. */
export function UploadButton({ inputId, label }: { inputId: string; label: string }) {
  return (
    <button
      type="button"
      className="btn pri"
      onClick={() => document.getElementById(inputId)?.click()}
    >
      <Icon name="upload" />
      {label}
    </button>
  );
}

/**
 * Vùng kéo thả của thư viện: tải vào thư mục đang mở. Tải xong một tệp thì mở khung chi tiết của
 * nó (để điền alt ngay); nhiều tệp thì chỉ làm mới lưới.
 */
export function MediaDropArea({
  inputId,
  folderId,
  folderName,
}: {
  inputId: string;
  folderId?: string | undefined;
  folderName: string;
}) {
  const t = useTranslations("media.upload");
  const router = useRouter();
  return (
    <DropZone
      inputId={inputId}
      folderId={folderId}
      onUploaded={(items) => {
        const only = items.length === 1 ? items[0] : undefined;
        if (only) {
          const query = new URLSearchParams(window.location.search);
          query.set("item", only.id);
          router.push(`/content/media?${query}`, { scroll: false });
        }
      }}
      hint={
        <>
          <b className="md-drop-hint-text">{t("dropTitle")}</b>
          <span>{folderName ? t("dropInto", { folder: folderName }) : t("dropRoot")}</span>
        </>
      }
    />
  );
}
