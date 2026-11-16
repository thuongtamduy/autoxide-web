import { getLocale, getTranslations } from "next-intl/server";
import {
  assignPlanAction,
  cancelSubscriptionAction,
  markPaidAction,
  readOnlyTenant,
} from "@/app/(platform)/platform/actions";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatMoney } from "@/lib/format";
import type { OperatorPeriod, OperatorSubscription, Plan, Tenant } from "@/sample/platform-data";

/**
 * Thao tác trên thuê bao của một khách (màn Thuê bao và trang chi tiết khách dùng chung): đánh dấu
 * đã thu kỳ đang mở, gán gói khác (gõ lại tên khách), đặt / bỏ chỉ đọc, huỷ ngay. Thao tác không đảo
 * được hỏi lại và nêu hệ quả.
 */
export async function SubscriptionActions({
  tenant,
  subscription,
  periods,
  plans,
}: {
  tenant: Tenant;
  subscription: OperatorSubscription;
  periods: readonly OperatorPeriod[];
  plans: readonly Plan[];
}) {
  const t = await getTranslations("platform.subs");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const open = periods.find((p) => p.tenant_id === tenant.id && p.status === "open");
  const live = !["canceled", "deleted"].includes(subscription.status);
  const today = new Date().toISOString().slice(0, 10);
  const priceOptions = plans
    .filter((p) => p.kind === "base" && p.status === "active")
    .flatMap((plan) =>
      plan.prices
        .filter((price) => price.active)
        .map((price) => ({
          value: price.id,
          label: t("priceOption", {
            plan: plan.name,
            price: tp("price", {
              amount: formatMoney(price.amount_minor, price.amount_currency, locale),
              interval: tp(`interval.${price.interval}`),
            }),
          }),
        })),
    );
  return (
    <div className="eg-acts">
      {open ? (
        <FormDialog
          action={markPaidAction}
          label={t("markPaid")}
          triggerClass="btn sm pri"
          title={t("markPaidTitle", { tenant: tenant.name })}
          intro={t("markPaidIntro", {
            amount: formatMoney(open.amount_minor, open.amount_currency, locale),
          })}
          submit={t("markPaidSubmit")}
          done={t("markPaidDone", { tenant: tenant.name })}
          fields={[
            { kind: "hidden", name: "period_id", value: open.id },
            {
              kind: "text",
              name: "provider_reference",
              label: t("reference"),
              mono: true,
              hint: t("referenceHint"),
            },
            { kind: "date", name: "paid_at", label: t("paidAt"), defaultValue: today },
          ]}
        />
      ) : null}
      {live ? (
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
              name: "price_id",
              label: t("assignPrice"),
              defaultValue: subscription.price_id,
              options: priceOptions,
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
      {["trialing", "active", "past_due"].includes(subscription.status) ? (
        <ConfirmAction
          action={readOnlyTenant}
          id={`${tenant.id}|on`}
          label={t("readOnly")}
          title={t("readOnlyTitle", { tenant: tenant.name })}
          points={[
            t("readOnlyBlocks"),
            t("readOnlyKeeps"),
            t("readOnlyNotSuspend"),
            t("readOnlyUndo"),
          ]}
          submit={t("readOnlySubmit")}
          done={t("readOnlyDone", { tenant: tenant.name })}
        />
      ) : null}
      {subscription.status === "suspended" ? (
        <ConfirmAction
          action={readOnlyTenant}
          id={`${tenant.id}|off`}
          label={t("resume")}
          title={t("resumeTitle", { tenant: tenant.name })}
          points={[t("resumeWrites"), t("resumePeriod")]}
          submit={t("resumeSubmit")}
          done={t("resumeDone", { tenant: tenant.name })}
          danger={false}
        />
      ) : null}
      {live ? (
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
    </div>
  );
}
