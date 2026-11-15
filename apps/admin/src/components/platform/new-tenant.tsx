import { getTranslations } from "next-intl/server";
import { createTenant } from "@/app/(platform)/platform/tenant-actions";
import { FormDialog } from "@/components/ui/form-dialog";

/**
 * Nút "Thêm khách": tạo khách thật ở core (`POST /kernel/tenants`, bước 33). Bản cài một khách
 * (`single`) từ chối bằng `tenant_single_mode`; lỗi theo ô; xong thì mở trang của khách mới.
 */
export async function NewTenantDialog({
  placements,
  parents,
}: {
  placements: readonly { value: string; label: string }[];
  parents: readonly { value: string; label: string }[];
}) {
  const t = await getTranslations("platform.newTenant");
  return (
    <FormDialog
      action={createTenant}
      label={t("button")}
      triggerClass="btn"
      title={t("title")}
      intro={t("intro")}
      submit={t("submit")}
      done={t("done")}
      fields={[
        { kind: "text", name: "name", label: t("name") },
        { kind: "text", name: "slug", label: t("slug"), mono: true, hint: t("slugHint") },
        {
          kind: "select",
          name: "placement",
          label: t("placement"),
          hint: t("placementHint"),
          options: placements,
          defaultValue: placements.find((p) => p.value === "main")?.value ?? "",
        },
        {
          kind: "select",
          name: "parent_id",
          label: t("parent"),
          options: [{ value: "", label: t("noParent") }, ...parents],
          defaultValue: "",
        },
      ]}
    />
  );
}
