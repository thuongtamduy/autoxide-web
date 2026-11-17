import { getLocale, getTranslations } from "next-intl/server";
import { provisionTenant } from "@/app/(platform)/platform/provision-actions";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatMoney } from "@/lib/format";
import { priceChoices } from "@/lib/plans";
import { loadAllPlans } from "@/lib/plans-server";
import { platformData } from "@/lib/platform-server";

/**
 * Nút "Cấp phát khách mới" (`POST /plans/provisionings`, D-338 của core): tạo khách trên một gói, chạy
 * nền (tạo khách → gán gói → dữ liệu mẫu → mời quản trị viên). Lỗi theo ô; xong thì mở tab Cấp phát.
 */
export async function ProvisionDialog({ primary = true }: { primary?: boolean }) {
  const t = await getTranslations("platform");
  const locale = await getLocale();
  const [plans, data] = await Promise.all([loadAllPlans(), platformData()]);
  const choices = priceChoices(plans);
  const placements = data.placements.filter((p) => p.source === "core" && !p.control);
  return (
    <FormDialog
      action={provisionTenant}
      label={t("provision.button")}
      triggerClass={primary ? "btn pri" : "btn"}
      title={t("provision.title")}
      intro={t("provision.intro")}
      points={[t("provision.stepsCore"), t("provision.kycCore"), t("provision.dedicatedCore")]}
      submit={t("provision.submit")}
      done={t("provision.done")}
      fields={[
        {
          kind: "text",
          name: "name",
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
          name: "choice",
          label: t("provision.plan"),
          defaultValue: choices.find((c) => c.plan.is_default)?.value ?? choices[0]?.value ?? "",
          options: choices.map(({ value, plan, price }) => ({
            value,
            label: t("provision.priceOption", {
              name: plan.name,
              price: t("price", {
                amount: formatMoney(price.amount.amount, price.amount.currency, locale),
                interval: t(`interval.${price.interval === "year" ? "year" : "month"}`),
              }),
              placement: t(`placementKind.${plan.placement}`),
            }),
          })),
        },
        {
          kind: "select",
          name: "placement",
          label: t("provision.placement"),
          defaultValue: "",
          hint: t("provision.placementHintCore"),
          options: [
            { value: "", label: t("provision.byPlan") },
            ...placements.map((p) => ({
              value: p.name,
              label: `${t(`placementKind.${p.kind}`)} · ${p.name}`,
            })),
          ],
        },
        {
          kind: "select",
          name: "parent_id",
          label: t("provision.parent"),
          defaultValue: "",
          hint: t("provision.parentHint"),
          options: [
            { value: "", label: t("provision.noParent") },
            ...data.tenants
              .filter((x) => x.source === "core" && !x.is_platform && x.status === "active")
              .map((x) => ({ value: x.id, label: x.name })),
          ],
        },
        {
          kind: "email",
          name: "admin_email",
          label: t("provision.email"),
          placeholder: "chu.cua.hang@example.com",
        },
        { kind: "text", name: "admin_name", label: t("provision.adminName") },
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
