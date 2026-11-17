import { getTranslations } from "next-intl/server";
import type { FieldSpec } from "@/components/ui/form-dialog";
import { limitsText, type Plan } from "@/lib/plans";

/** Ô của biểu mẫu gói (tạo và sửa dùng chung); `create` thêm mã gói và loại. */
export async function planFields(
  defaults: {
    name?: string;
    description?: string;
    modules?: string;
    features?: string;
    limits?: string;
    trial_days?: string;
    placement?: string;
  },
  create: boolean,
): Promise<FieldSpec[]> {
  const t = await getTranslations("platform.plans");
  const tp = await getTranslations("platform");
  return [
    ...(create
      ? ([
          {
            kind: "text",
            name: "code",
            label: t("code"),
            mono: true,
            placeholder: "pro-2026",
            hint: t("codeHint"),
          },
          {
            kind: "select",
            name: "kind",
            label: t("kind"),
            defaultValue: "base",
            options: [
              { value: "base", label: t("kinds.base") },
              { value: "addon", label: t("kinds.addon") },
            ],
          },
        ] as const)
      : []),
    { kind: "text", name: "name", label: t("name"), defaultValue: defaults.name ?? "" },
    {
      kind: "textarea",
      name: "description",
      label: t("about"),
      defaultValue: defaults.description ?? "",
    },
    {
      kind: "text",
      name: "modules",
      label: t("modules"),
      mono: true,
      defaultValue: defaults.modules ?? "",
      placeholder: "content, media, catalog",
      hint: t("modulesHint"),
    },
    {
      kind: "text",
      name: "features",
      label: t("features"),
      mono: true,
      defaultValue: defaults.features ?? "",
      placeholder: "auth.api_keys, content.ai_suggestions",
      hint: t("featuresHint"),
    },
    {
      kind: "textarea",
      name: "limits",
      label: t("limits"),
      defaultValue: defaults.limits ?? "",
      hint: t("limitsHint"),
    },
    {
      kind: "number",
      name: "trial_days",
      label: t("trial"),
      defaultValue: defaults.trial_days ?? "14",
      hint: t("trialHint"),
    },
    {
      kind: "select",
      name: "placement",
      label: t("placement"),
      defaultValue: defaults.placement ?? "shared",
      options: [
        { value: "shared", label: tp("placementKind.shared") },
        { value: "dedicated", label: tp("placementKind.dedicated") },
      ],
    },
  ];
}

/** Ô của hộp "Sửa gói" điền sẵn theo gói (trang danh sách gói và trang chi tiết dùng chung). */
export async function editPlanFields(plan: Plan): Promise<FieldSpec[]> {
  return [
    { kind: "hidden", name: "plan_id", value: plan.id },
    ...(await planFields(
      {
        name: plan.name,
        description: plan.description,
        modules: plan.modules.join(", "),
        features: plan.features.join(", "),
        limits: limitsText(plan.limits as Record<string, number | null>),
        trial_days: String(plan.trial_days),
        placement: plan.placement,
      },
      false,
    )),
  ];
}
