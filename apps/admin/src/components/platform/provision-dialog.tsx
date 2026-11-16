import { getTranslations } from "next-intl/server";
import { provisionTenant } from "@/app/(platform)/platform/actions";
import { FormDialog } from "@/components/ui/form-dialog";
import { listPlacements, listTenants } from "@/sample/platform";
import { BUSINESS_MODELS } from "@/sample/platform-data";
import { listPlans } from "@/sample/platform-plans";

/**
 * Nút "Cấp phát khách mới": hộp thoại tạo một lượt cấp phát chạy bằng job (tạo khách → database →
 * migrate → dữ liệu mẫu → thuê bao → mời quản trị). Lỗi theo ô; xong thì mở tab Cấp phát.
 */
export async function ProvisionDialog({ primary = true }: { primary?: boolean }) {
  const t = await getTranslations("platform");
  const [{ data: plans }, { data: placements }, { data: tenants }] = await Promise.all([
    listPlans({ status: "active", kind: "base" }),
    listPlacements(),
    listTenants(),
  ]);
  const shared = placements.filter((p) => p.kind === "shared" && !p.control);
  return (
    <FormDialog
      action={provisionTenant}
      label={t("provision.button")}
      triggerClass={primary ? "btn pri" : "btn"}
      title={t("provision.title")}
      intro={t("provision.intro")}
      points={[t("provision.steps"), t("provision.kyc"), t("provision.dedicated")]}
      submit={t("provision.submit")}
      done={t("provision.done")}
      fields={[
        {
          kind: "text",
          name: "tenant_name",
          label: t("provision.name"),
          placeholder: t("provision.namePh"),
        },
        {
          kind: "text",
          name: "slug",
          label: t("provision.slug"),
          mono: true,
          placeholder: "tra-hoa-sen",
          hint: t("provision.slugHint"),
        },
        {
          kind: "select",
          name: "business_model",
          label: t("provision.model"),
          defaultValue: "single_store",
          options: BUSINESS_MODELS.map((model) => ({ value: model, label: t(`models.${model}`) })),
        },
        {
          kind: "select",
          name: "plan_id",
          label: t("provision.plan"),
          defaultValue: plans.find((p) => p.is_default)?.id ?? plans[0]?.id ?? "",
          options: plans.map((plan) => ({
            value: plan.id,
            label: t("provision.planOption", {
              name: plan.name,
              placement: t(`placementKind.${plan.placement}`),
            }),
          })),
        },
        {
          kind: "select",
          name: "placement",
          label: t("provision.placement"),
          defaultValue: "plan",
          hint: t("provision.placementHint"),
          options: [
            { value: "plan", label: t("provision.byPlan") },
            ...shared.map((p) => ({
              value: p.name,
              label: t("provision.sharedOption", { name: p.name }),
            })),
            { value: "dedicated", label: t("provision.dedicatedOption") },
          ],
        },
        {
          kind: "select",
          name: "parent_tenant_id",
          label: t("provision.parent"),
          defaultValue: "",
          hint: t("provision.parentHint"),
          options: [
            { value: "", label: t("provision.noParent") },
            ...tenants
              .filter((x) => !x.is_platform && x.status === "active")
              .map((x) => ({ value: x.id, label: x.name })),
          ],
        },
        {
          kind: "email",
          name: "admin_email",
          label: t("provision.email"),
          placeholder: "chu.cua.hang@example.com",
        },
        {
          kind: "check",
          name: "sample_data",
          label: t("provision.sample"),
          hint: t("provision.sampleHint"),
        },
      ]}
    />
  );
}
