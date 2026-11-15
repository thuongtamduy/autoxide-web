"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/shell/icon";
import { formatBytes, type UploadLimits } from "@/lib/media";
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
  limits,
}: {
  inputId: string;
  folderId?: string | undefined;
  folderName: string;
  /** Giới hạn của máy chủ (`GET /kernel/client-config`); `null` khi core không trả. */
  limits: UploadLimits | null;
}) {
  const t = useTranslations("media.upload");
  const locale = useLocale();
  const router = useRouter();
  return (
    <DropZone
      inputId={inputId}
      folderId={folderId}
      limits={limits}
      accept={limits && limits.allowedTypes.length > 0 ? limits.allowedTypes.join(",") : undefined}
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
          {limits ? (
            <span className="fhint">
              {t("limits", { max: formatBytes(limits.maxBytes, locale) })}
            </span>
          ) : null}
        </>
      }
    />
  );
}
