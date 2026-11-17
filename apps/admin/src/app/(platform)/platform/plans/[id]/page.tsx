import { ApiError } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addPriceAction,
  deactivatePriceAction,
  makeDefault,
  retirePlan,
  startSelling,
  updatePlanAction,
} from "@/app/(platform)/platform/plan-actions";
import { Back, DetailHead, Facts } from "@/components/engage/common";
import { PLAN_BADGE, StatusBadge } from "@/components/platform/common";
import { editPlanFields } from "@/components/platform/plan-fields";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { formatBytes, formatCount, formatMoney } from "@/lib/format";
import { PLANS_MANAGE } from "@/lib/permissions";
import { isBytes, type Plan } from "@/lib/plans";
import { loadAllSubscriptions } from "@/lib/plans-server";
import { can } from "@/lib/viewer";

async function loadPlan(id: string): Promise<Plan | null> {
  try {
    return (await load((c) => c.GET("/api/v1/plans/plans/{id}", { params: { path: { id } } })))
      .data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

// Chi tiết một gói (`GET /plans/plans/{id}`, bước 35 của core): module, tính năng, hạn mức, vòng đời
// thuê bao, giá. Giá đã có không sửa: thêm giá mới rồi tắt giá cũ; khách giữ giá cũ tới khi đổi gói.
// Sửa gói gửi lại cả gói (`PUT`): khách đang dùng nhận nội dung mới ngay.
export default async function PlanPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const plan = await loadPlan(id);
  if (!plan) notFound();
  const subscribers = (await loadAllSubscriptions({ plan_id: plan.id })).filter(
    (sub) => sub.status !== "deleted",
  ).length;
  const limits = Object.entries(plan.limits as Record<string, number | null>);
  const t = await getTranslations("platform.plans");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const manage = await can(PLANS_MANAGE);
  const editable = manage && plan.status !== "retired";
  const limitValue = (key: string, max: number | null) =>
    max === null
      ? tp("unlimited")
      : isBytes(key)
        ? formatBytes(max, locale)
        : formatCount(max, locale);
  const limitLabel = (key: string) =>
    tp.has(`limits.${key.replaceAll(".", "_")}`) ? tp(`limits.${key.replaceAll(".", "_")}`) : key;
  const status = plan.status === "active" || plan.status === "retired" ? plan.status : "draft";

  return (
    <div className="blocks">
      <Back href="/platform/plans" label={t("back")} />
      <DetailHead
        title={plan.name}
        badge={<StatusBadge className={PLAN_BADGE[status]} label={tp(`planStatus.${status}`)} />}
        description={plan.description}
        actions={
          manage ? (
            <>
              {plan.status === "draft" ? (
                <InlineAction
                  action={startSelling}
                  id={plan.id}
                  label={t("start")}
                  done={t("started", { plan: plan.name })}
                />
              ) : null}
              {plan.status === "active" && plan.kind === "base" && !plan.is_default ? (
                <InlineAction
                  action={makeDefault}
                  id={plan.id}
                  label={t("makeDefault")}
                  done={t("madeDefault", { plan: plan.name })}
                />
              ) : null}
              {editable ? (
                <FormDialog
                  action={updatePlanAction}
                  label={t("edit")}
                  title={t("editTitle", { plan: plan.name })}
                  intro={t("editIntro")}
                  submit={t("editSubmit")}
                  done={t("edited")}
                  fields={await editPlanFields(plan)}
                />
              ) : null}
              {editable ? (
                <FormDialog
                  action={addPriceAction}
                  label={t("addPrice")}
                  title={t("addPriceTitle", { plan: plan.name })}
                  intro={t("addPriceIntro")}
                  submit={t("addPriceSubmit")}
                  done={t("priceAdded")}
                  fields={[
                    { kind: "hidden", name: "plan_id", value: plan.id },
                    {
                      kind: "select",
                      name: "interval",
                      label: t("interval"),
                      defaultValue: "month",
                      options: [
                        { value: "month", label: tp("interval.month") },
                        { value: "year", label: tp("interval.year") },
                      ],
                    },
                    {
                      kind: "text",
                      name: "amount",
                      label: t("amount"),
                      mono: true,
                      placeholder: "1290000",
                      hint: t("amountHint"),
                    },
                    {
                      kind: "text",
                      name: "currency",
                      label: t("currency"),
                      mono: true,
                      defaultValue: plan.prices[0]?.amount.currency ?? "VND",
                    },
                  ]}
                />
              ) : null}
              {plan.status === "active" ? (
                <ConfirmAction
                  action={retirePlan}
                  id={plan.id}
                  label={t("retire")}
                  title={t("retireTitle", { plan: plan.name })}
                  points={[
                    t("retireSignup"),
                    t("retireKeep", { count: subscribers }),
                    t("retireNoDelete"),
                  ]}
                  submit={t("retireSubmit")}
                  done={t("retired", { plan: plan.name })}
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      <section className="block" aria-labelledby="pf-plan-facts">
        <h2 id="pf-plan-facts" className="h2">
          {t("facts")}
        </h2>
        <div className="card padded">
          <Facts
            items={[
              [
                t("code"),
                <span key="c" className="mono">
                  {plan.code}
                </span>,
              ],
              [
                t("kind"),
                t(`kinds.${plan.kind === "addon" ? "addon" : "base"}`) +
                  (plan.is_default ? ` · ${t("default")}` : ""),
              ],
              [t("trial"), t("days", { count: plan.trial_days })],
              [
                t("lifecycle"),
                t("lifecycleValue", {
                  grace: plan.grace_days,
                  suspend: plan.suspend_days,
                  retention: plan.retention_days,
                }),
              ],
              [
                t("placement"),
                tp(`placementKind.${plan.placement === "dedicated" ? "dedicated" : "shared"}`),
              ],
              [t("kyc"), plan.requires_kyc ? t("kycYes") : t("kycNo")],
              [t("colTenants"), String(subscribers)],
              [t("updated"), <Time key="u" value={plan.updated_at} />],
            ]}
          />
        </div>
      </section>

      <section className="block half" aria-labelledby="pf-plan-mods">
        <h2 id="pf-plan-mods" className="h2">
          {t("modules")}
        </h2>
        <div className="card padded">
          {plan.modules.length > 0 ? (
            <ul className="tags">
              {plan.modules.map((m) => (
                <li key={m} className="tag mono">
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("noModules")}</p>
          )}
          {plan.features.length > 0 ? (
            <p className="fhint">
              {t("features")}: <span className="mono">{plan.features.join(", ")}</span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="block half" aria-labelledby="pf-plan-limits">
        <h2 id="pf-plan-limits" className="h2">
          {t("limits")}
        </h2>
        <div className="card padded">
          {limits.length > 0 ? (
            <Facts items={limits.map(([key, max]) => [limitLabel(key), limitValue(key, max)])} />
          ) : (
            <p className="muted">{t("noLimits")}</p>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="pf-plan-prices">
        <h2 id="pf-plan-prices" className="h2">
          {t("prices")}
        </h2>
        <p className="fhint">{t("pricesAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colPrice")}</Th>
                <Th>{t("interval")}</Th>
                <Th>{t("added")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {plan.prices.map((price) => (
                <tr key={price.id}>
                  <Td className="rt-title">
                    <b>{formatMoney(price.amount.amount, price.amount.currency, locale)}</b>
                  </Td>
                  <Td label={t("interval")}>
                    {price.kind === "metered"
                      ? t("metered", { key: price.limit_key ?? "" })
                      : tp(`interval.${price.interval === "year" ? "year" : "month"}`)}
                  </Td>
                  <Td label={t("added")}>
                    <Time value={price.created_at} date />
                  </Td>
                  <Td label={t("colStatus")}>
                    <StatusBadge
                      className={price.active ? "badge b-ok" : "badge b-arch"}
                      label={price.active ? t("priceOn") : t("priceOff")}
                    />
                  </Td>
                  <Td className="rt-acts">
                    {manage && price.active ? (
                      <ConfirmAction
                        action={deactivatePriceAction}
                        id={price.id}
                        label={t("priceDeactivate")}
                        title={t("priceDeactivateTitle")}
                        points={[t("priceDeactivateNew"), t("priceDeactivateKeep")]}
                        submit={t("priceDeactivate")}
                        done={t("priceDeactivated")}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {plan.prices.length === 0 ? <p className="empty">{t("noPrice")}</p> : null}
        </div>
      </section>
    </div>
  );
}
