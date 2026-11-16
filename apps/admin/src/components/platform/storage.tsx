import type { components } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";

type PlacementStorage = components["schemas"]["PlacementStorage"];

/**
 * Nơi lưu file của một placement (`Placement.storage`, D-293 của core): thư mục trên máy chủ, bucket
 * S3, hay nơi lưu chung của nền tảng (`null`). Chỉ phần không bí mật — core không bao giờ trả khoá
 * truy cập, chỉ cho biết đã có khoá hay chưa (`credentials`).
 */
export async function PlacementStorageView({
  storage,
}: {
  storage: PlacementStorage | null | undefined;
}) {
  const t = await getTranslations("platform.storage");
  if (!storage) {
    return (
      <span className="cell2">
        <span>{t("shared")}</span>
        <span className="sub">{t("sharedHint")}</span>
      </span>
    );
  }
  if (storage.kind === "local") {
    return (
      <span className="cell2">
        <span>{t("local")}</span>
        {storage.dir ? <span className="sub mono">{storage.dir}</span> : null}
      </span>
    );
  }
  if (storage.kind === "s3") {
    const where = [storage.bucket, storage.prefix].filter(Boolean).join("/");
    return (
      <span className="cell2">
        <span>{t("s3")}</span>
        {where ? <span className="sub mono">{where}</span> : null}
        <span className="sub">
          {storage.region ? t("region", { region: storage.region }) : t("noRegion")} ·{" "}
          {storage.endpoint ? <span className="mono">{storage.endpoint}</span> : t("amazon")}
        </span>
        <span className="sub">{storage.credentials ? t("keyStored") : t("noKey")}</span>
      </span>
    );
  }
  return (
    <span className="cell2">
      <span className="tone-bad">
        {storage.kind === "unreadable" ? t("unreadable") : storage.kind}
      </span>
      {storage.kind === "unreadable" ? <span className="sub">{t("unreadableHint")}</span> : null}
    </span>
  );
}
