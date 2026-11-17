import { getLocale, getTranslations } from "next-intl/server";
import {
  assignPlanAction,
  cancelSubscriptionAction,
  suspendTenantAction,
} from "@/app/(platform)/platform/plan-actions";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatMoney } from "@/lib/format";
import { type Plan, priceChoices, type Subscription } from "@/lib/plans";

/**
 * Thao tác trên thuê bao của một khách (module `plans` của core): gán gói khác (gõ lại tên khách),
 * huỷ ngay, khoá hẳn. Thao tác không đảo được hỏi lại và nêu hệ quả. Core chưa có danh sách kỳ thanh
 * toán theo khách cho nhân sự nền tảng, nên chưa có "đánh dấu đã thu" ở đây.
 */
export async function PlanSubscriptionActions({
  tenant,
  subscription,
  plans,
}: {
  tenant: { id: string; name: string };
  subscription: Subscription | null;
  plans: readonly Plan[];
}) {
  const t = await getTranslations("platform.subs");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const live = !subscription || !["canceled", "deleted"].includes(subscription.status);
  const options = priceChoices(plans).map(({ value, plan, price }) => ({
    value,
    label: t("priceOption", {
      plan: plan.name,
      price: tp("price", {
        amount: formatMoney(price.amount.amount, price.amount.currency, locale),
        interval: tp(`interval.${price.interval === "year" ? "year" : "month"}`),
      }),
    }),
  }));
  return (
    <div className="eg-acts pf-rowacts">
      {live && options.length > 0 ? (
        <FormDialog
          action={assignPlanAction}
          label={t("assign")}
          title={t("assignTitle", { tenant: tenant.name })}
          intro={t("assignIntro")}
          points={[t("assignNow"), t("assignTrial")]}
          submit={t("assignSubmit")}
          done={t("assignDone", { tenant: tenant.name })}
          fields={[
            { kind: "hidden", name: "tenant_id", value: tenant.id },
            { kind: "hidden", name: "tenant_name", value: tenant.name },
            {
              kind: "select",
              name: "choice",
              label: t("assignPrice"),
              defaultValue: subscription
                ? `${subscription.plan_id}|${subscription.price_id ?? ""}`
                : (options[0]?.value ?? ""),
              options,
            },
            {
              kind: "text",
              name: "confirm",
              label: t("assignConfirm", { tenant: tenant.name }),
              hint: t("assignConfirmHint"),
            },
          ]}
        />
      ) : null}
      {subscription && live ? (
        <ConfirmAction
          action={cancelSubscriptionAction}
          id={tenant.id}
          label={t("cancel")}
          title={t("cancelTitle", { tenant: tenant.name })}
          points={[t("cancelReadOnly"), t("cancelDelete"), t("cancelNoUndo")]}
          submit={t("cancelSubmit")}
          done={t("cancelDone", { tenant: tenant.name })}
        />
      ) : null}
      {subscription ? (
        <FormDialog
          action={suspendTenantAction}
          label={t("suspend")}
          title={t("suspendTitle", { tenant: tenant.name })}
          intro={t("suspendIntro")}
          submit={t("suspendSubmit")}
          done={t("suspendDone", { tenant: tenant.name })}
          fields={[
            { kind: "hidden", name: "tenant_id", value: tenant.id },
            { kind: "textarea", name: "reason", label: tp("reason"), hint: tp("reasonHint") },
          ]}
        />
      ) : null}
    </div>
  );
}
