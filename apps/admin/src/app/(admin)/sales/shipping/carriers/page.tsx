import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { carrierActiveAction, testCarrierAction } from "@/app/(admin)/sales/shipping/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { CARRIER_BADGE } from "@/components/shipping/badges";
import { CarrierDialog, KeyDialog } from "@/components/shipping/forms";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { vnDateTime } from "@/lib/promotions";
import { CARRIER_CODES, type CarrierCapabilities, listCarrierAccounts } from "@/sample/shipping";
import { TAB_PERMISSIONS, unitOptions } from "../shared";

const CAPABILITIES: (keyof CarrierCapabilities)[] = [
  "multi_parcel",
  "cod",
  "label",
  "cancel",
  "statement_api",
  "webhook",
];

// Tab "Hãng vận chuyển": mỗi hãng cần một bộ nối riêng (module riêng của core, D-191). Khoá API của
// hãng lưu mã hoá ở kho secret theo khách: nhập một lần, không hiện lại, không ghi vào log.
export default async function CarriersPage(props: PageProps<"/sales/shipping/carriers">) {
  const gate = await commerceGate(TAB_PERMISSIONS.carriers);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [{ data: accounts }, orgs] = await Promise.all([
    listCarrierAccounts(),
    unitOptions((type) => type !== "warehouse"),
  ]);
  const codes = Object.entries(CARRIER_CODES).map(([value, label]) => ({ value, label }));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="carriers-h">
        <div className="block-head">
          <h2 id="carriers-h" className="h2">
            {t("carriers.title")}
          </h2>
          <CarrierDialog codes={codes} orgs={orgs} />
        </div>
        <p className="fhint">{t("carriers.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("carriers.carrier")}</Th>
                <Th>{t("carriers.supports")}</Th>
                <Th>{t("carriers.lastEvent")}</Th>
                <Th>{t("carriers.state")}</Th>
                <Th>
                  <span className="vh">{t("rates.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((c) => {
                const isOpen = open === c.id;
                const state = c.active ? c.check_status : "off";
                return [
                  <tr key={c.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={
                            isOpen
                              ? "/sales/shipping/carriers"
                              : `/sales/shipping/carriers?open=${c.id}#carriers-h`
                          }
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {c.name}
                        </Link>
                        <span className="sub">
                          {c.org_name} · {c.sandbox ? t("carriers.sandbox") : t("carriers.live")}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("carriers.supports")}>
                      {CAPABILITIES.filter((k) => c.capabilities[k])
                        .map((k) => t(`capabilities.${k}`))
                        .join(", ")}
                    </Td>
                    <Td label={t("carriers.lastEvent")}>
                      {c.last_event_at ? vnDateTime(c.last_event_at, locale) : "—"}
                    </Td>
                    <Td label={t("carriers.state")}>
                      <span className={CARRIER_BADGE[state]}>
                        <span className="dot" />
                        {t(`carrierState.${state}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="row-acts">
                        {c.active ? (
                          <InlineAction
                            action={testCarrierAction}
                            id={c.id}
                            label={t("carriers.test")}
                            ariaLabel={`${t("carriers.test")} ${c.name}`}
                            done={t("carriers.tested")}
                          />
                        ) : null}
                        <KeyDialog id={c.id} name={c.name} primary={c.check_status === "error"} />
                      </span>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${c.id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          <h3 className="h2">{c.name}</h3>
                          <dl className="cat-kv">
                            <dt>{t("carriers.code")}</dt>
                            <dd className="mono">{c.carrier_code}</dd>
                            <dt>{t("carriers.key")}</dt>
                            <dd>
                              {c.secret_set_at
                                ? t("carriers.keySet", {
                                    date: vnDateTime(c.secret_set_at, locale),
                                  })
                                : t("carriers.keyMissing")}
                            </dd>
                            <dt>{t("carriers.tracking")}</dt>
                            <dd>
                              {c.capabilities.webhook
                                ? t("carriers.webhook")
                                : t("carriers.polling")}
                            </dd>
                            <dt>{t("carriers.methods")}</dt>
                            <dd>{t("carriers.methodCount", { count: c.method_count })}</dd>
                            {c.checked_at ? (
                              <>
                                <dt>{t("carriers.checked")}</dt>
                                <dd>{vnDateTime(c.checked_at, locale)}</dd>
                              </>
                            ) : null}
                            {c.last_error ? (
                              <>
                                <dt>{t("carriers.error")}</dt>
                                <dd>
                                  {t.has(`carrierErrors.${c.last_error}`)
                                    ? t(`carrierErrors.${c.last_error}`)
                                    : c.last_error}
                                </dd>
                              </>
                            ) : null}
                          </dl>
                          {c.check_status === "error" ? (
                            <p className="fhint">{t("carriers.errorNote")}</p>
                          ) : null}
                          {c.carrier_code === "fake" ? (
                            <p className="fhint">{t("carriers.fakeNote")}</p>
                          ) : null}
                          <ChangeButtons
                            action={carrierActiveAction}
                            id={c.id}
                            expect={c.checked_at ?? ""}
                            moves={[
                              c.active
                                ? {
                                    value: "off",
                                    label: t("carriers.turnOff"),
                                    done: t("carriers.turnedOff"),
                                    tone: "danger",
                                  }
                                : {
                                    value: "on",
                                    label: t("carriers.turnOn"),
                                    done: t("carriers.turnedOn"),
                                  },
                            ]}
                            undo={{ label: t("undo"), done: t("undone") }}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("carriers.foot")}</p>
      </section>
    </div>
  );
}
