import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { methodActiveAction } from "@/app/(admin)/sales/shipping/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { MethodDialog, QuoteForm } from "@/components/shipping/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { formatWeight, SHIPPING_SETTINGS_MANAGE } from "@/lib/shipping";
import { can } from "@/lib/viewer";
import {
  listCarrierAccounts,
  listMethods,
  listPickupPoints,
  listRates,
  METHOD_ID,
} from "@/sample/shipping";
import { provinceOptions, TAB_PERMISSIONS, unitOptions } from "../shared";

// Tab "Phí vận chuyển": phương thức giao khai ở nút cha thì nút con dùng chung; cửa hàng khai cùng mã
// thì ghi đè. Bảng phí theo vùng (tỉnh cụ thể thắng "cả nước") và bậc cân; tính thử phí dùng cùng hàm
// với báo giá cho đơn hàng. Địa chỉ hai cấp tỉnh → phường / xã (sau sắp xếp đơn vị hành chính 2025).
export default async function RatesPage(props: PageProps<"/sales/shipping/rates">) {
  const gate = await commerceGate(TAB_PERMISSIONS.rates);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getLocale(),
    props.searchParams,
  ]);
  const [{ data: methods }, { data: points }, { data: carriers }, manage, orgs, stores] =
    await Promise.all([
      listMethods(),
      listPickupPoints(),
      listCarrierAccounts(),
      can(SHIPPING_SETTINGS_MANAGE),
      unitOptions((type) => type !== "warehouse"),
      unitOptions((type) => type === "store"),
    ]);
  const tableMethods = methods.filter((m) => m.kind === "table_rate");
  const wanted = typeof params.method === "string" ? params.method : METHOD_ID.standard;
  const current = tableMethods.find((m) => m.id === wanted) ?? tableMethods[0];
  const rates = current ? await listRates(current.id) : null;
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const name = (m: { names: Record<string, string>; code: string }) =>
    m.names[locale] ?? m.names.vi ?? m.code;
  return (
    <div className="blocks">
      <p className="fhint">{t("rates.about")}</p>
      <section className="block" aria-labelledby="methods-h">
        <div className="block-head">
          <h2 id="methods-h" className="h2">
            {t("rates.methods")}
          </h2>
          {manage ? (
            <MethodDialog
              orgs={orgs}
              carriers={carriers.map((c) => ({ value: c.id, label: c.name }))}
            />
          ) : null}
        </div>
        <p className="fhint">{t("rates.methodsAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("rates.method")}</Th>
                <Th>{t("rates.kind")}</Th>
                <Th>{t("rates.node")}</Th>
                <Th className="text-right">{t("rates.freeOver")}</Th>
                <Th>{t("rates.state")}</Th>
                <Th>
                  <span className="vh">{t("rates.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <span>{name(m)}</span>
                      <span className="sub">
                        <span className="mono">{m.code}</span>
                        {m.estimated_min_days !== null && m.estimated_max_days !== null
                          ? ` · ${
                              m.estimated_max_days === 0
                                ? t("rates.sameDay")
                                : t("rates.days", {
                                    min: m.estimated_min_days,
                                    max: m.estimated_max_days,
                                  })
                            }`
                          : ""}
                        {m.cutoff ? ` · ${t("rates.cutoff", { time: m.cutoff })}` : ""}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("rates.kind")}>
                    <span className="cell2">
                      <span>{t(`kinds.${m.kind}`)}</span>
                      {m.carrier_name ? (
                        <span className="sub">
                          {m.carrier_name}
                          {m.carrier_status === "error" ? ` · ${t("rates.carrierError")}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td label={t("rates.node")}>
                    <span className="cell2">
                      <span>{m.org_name}</span>
                      {m.overrides ? <span className="sub">{t("rates.overrides")}</span> : null}
                    </span>
                  </Td>
                  <Td label={t("rates.freeOver")} className="text-right num">
                    {m.free_over ? money(m.free_over.amount) : t("rates.noFree")}
                  </Td>
                  <Td label={t("rates.state")}>
                    <span className={m.active ? "badge b-ok" : "badge b-arch"}>
                      <span className="dot" />
                      {m.active ? t("rates.on") : t("rates.off")}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {manage ? (
                      <ChangeButtons
                        action={methodActiveAction}
                        id={m.id}
                        expect={m.updated_at}
                        moves={[
                          m.active
                            ? {
                                value: "off",
                                label: t("rates.turnOff"),
                                done: t("rates.turnedOff"),
                                tone: "danger",
                              }
                            : { value: "on", label: t("rates.turnOn"), done: t("rates.turnedOn") },
                        ]}
                        undo={{ label: t("undo"), done: t("undone") }}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      {current && rates ? (
        <section className="block" aria-labelledby="rates-h">
          <div className="block-head">
            <h2 id="rates-h" className="h2">
              {t("rates.table", { method: name(current), node: current.org_name })}
            </h2>
          </div>
          {tableMethods.length > 1 ? (
            <nav className="chips" aria-label={t("rates.pick")}>
              {tableMethods.map((m) => (
                <Link
                  key={m.id}
                  className={m.id === current.id ? "chip on" : "chip"}
                  href={`/sales/shipping/rates?method=${m.id}#rates-h`}
                  aria-current={m.id === current.id ? "page" : undefined}
                >
                  {name(m)} · {m.org_name}
                </Link>
              ))}
            </nav>
          ) : null}
          <p className="fhint">{t("rates.tableAbout", { divisor: current.volumetric_divisor })}</p>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("rates.zone")}</Th>
                  <Th>{t("rates.tier")}</Th>
                  <Th className="text-right">{t("rates.fee")}</Th>
                  <Th>{t("rates.step")}</Th>
                </tr>
              </thead>
              <tbody>
                {rates.data.rates.map((r) => {
                  const zone = rates.data.zones.find((z) => z.id === r.zone_id);
                  return (
                    <tr key={r.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <span>{zone?.name ?? r.zone_id}</span>
                          <span className="sub">
                            {zone?.province_codes
                              ? t("rates.provinces", { count: zone.province_codes.length })
                              : t("rates.rest")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("rates.tier")}>
                        {r.max_weight_grams === null
                          ? t("rates.from", { weight: formatWeight(r.min_weight_grams, locale) })
                          : `${formatWeight(r.min_weight_grams, locale)} – ${formatWeight(r.max_weight_grams, locale)}`}
                      </Td>
                      <Td label={t("rates.fee")} className="text-right num">
                        {money(r.amount.amount)}
                      </Td>
                      <Td label={t("rates.step")}>
                        {r.step_grams && r.step_amount
                          ? t("rates.stepText", {
                              amount: money(r.step_amount.amount),
                              weight: formatWeight(r.step_grams, locale),
                            })
                          : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <p className="fhint">{t("rates.vat")}</p>
        </section>
      ) : null}

      <section className="block" aria-label={t("quote.title")}>
        <div className="pm-pair">
          <QuoteForm stores={stores} provinces={provinceOptions()} />
          <div className="pm-stack">
            <div className="block-head">
              <h2 className="h2">{t("rates.pickup")}</h2>
            </div>
            <p className="fhint">{t("rates.pickupAbout")}</p>
            <div className="card tcard">
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("rates.store")}</Th>
                    <Th>{t("rates.prep")}</Th>
                    <Th>{t("rates.hold")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.org_id}>
                      <Td className="rt-title">{p.org_name}</Td>
                      <Td label={t("rates.prep")}>{t("rates.hours", { count: p.prep_hours })}</Td>
                      <Td label={t("rates.hold")}>{t("rates.holdDays", { count: p.hold_days })}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="fhint">{t("rates.pickupFoot")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
