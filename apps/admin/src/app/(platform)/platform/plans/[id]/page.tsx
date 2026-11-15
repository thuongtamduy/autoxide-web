import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addPriceAction,
  deactivatePriceAction,
  retirePlan,
  startSelling,
  updatePlanAction,
} from "@/app/(platform)/platform/actions";
import { Back, DetailHead, Facts } from "@/components/engage/common";
import { PLAN_BADGE, StatusBadge } from "@/components/platform/common";
import { planFields } from "@/components/platform/plan-fields";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatBytes, formatCount, formatMoney } from "@/lib/format";
import { PLANS_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { getPlan, missingDependency } from "@/sample/platform-plans";

// Chi tiết một gói (dữ liệu mẫu, W-014): module, tính năng, hạn mức, vòng đời thuê bao, giá. Giá đã
// có không sửa: thêm giá mới rồi tắt giá cũ; khách giữ giá cũ tới khi đổi gói.
export default async function PlanPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const found = await getPlan(id);
  if (!found) notFound();
  const plan = found.data;
  const t = await getTranslations("platform.plans");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const manage = await can(PLANS_MANAGE);
  const editable = manage && plan.status !== "retired";
  const missing = plan.kind === "addon" ? missingDependency(plan.modules) : null;
  const limitValue = (key: string, max: number | null) =>
    max === null
      ? tp("unlimited")
      : key === "files.storage_bytes"
        ? formatBytes(max, locale)
        : formatCount(max, locale);

  return (
    <div className="blocks">
      <Back href="/platform/plans" label={t("back")} />
      <DetailHead
        title={plan.name}
        badge={
          <StatusBadge
            className={PLAN_BADGE[plan.status]}
            label={tp(`planStatus.${plan.status}`)}
          />
        }
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
              {editable ? (
                <FormDialog
                  action={updatePlanAction}
                  label={t("edit")}
                  title={t("editTitle", { plan: plan.name })}
                  intro={t("editIntro")}
                  submit={t("editSubmit")}
                  done={t("edited")}
                  fields={[
                    { kind: "hidden", name: "plan_id", value: plan.id },
                    ...(await planFields(
                      {
                        name: plan.name,
                        description: plan.description,
                        modules: plan.modules.join(", "),
                        trial_days: String(plan.trial_days),
                        placement: plan.placement,
                      },
                      false,
                    )),
                  ]}
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
                    t("retireKeep", { count: plan.subscriber_count }),
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
      {missing ? <p className="note warn">{t("dependency", missing)}</p> : null}

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
              [t("kind"), t(`kinds.${plan.kind}`) + (plan.is_default ? ` · ${t("default")}` : "")],
              [t("trial"), t("days", { count: plan.trial_days })],
              [
                t("lifecycle"),
                t("lifecycleValue", {
                  grace: plan.grace_days,
                  suspend: plan.suspend_days,
                  retention: plan.retention_days,
                }),
              ],
              [t("placement"), tp(`placementKind.${plan.placement}`)],
              [t("kyc"), plan.requires_kyc ? t("kycYes") : t("kycNo")],
              [t("colTenants"), String(plan.subscriber_count)],
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
          {plan.limits.length > 0 ? (
            <Facts
              items={plan.limits.map((l) => [
                tp(`limits.${l.key.replaceAll(".", "_")}`),
                limitValue(l.key, l.max_value),
              ])}
            />
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
                    <b>{formatMoney(price.amount_minor, price.amount_currency, locale)}</b>
                  </Td>
                  <Td label={t("interval")}>{tp(`interval.${price.interval}`)}</Td>
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
