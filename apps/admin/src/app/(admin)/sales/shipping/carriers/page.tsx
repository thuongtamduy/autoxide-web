import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import {
  bulkCarrierOffAction,
  bulkCarrierOnAction,
  carrierActiveAction,
  testCarrierAction,
  undoCarrierOffAction,
  undoCarrierOnAction,
} from "@/app/(admin)/sales/shipping/actions";
import { CARRIER_BADGE } from "@/components/shipping/badges";
import { CarrierDialog, KeyDialog } from "@/components/shipping/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
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
// hãng lưu mã hoá ở kho secret theo khách: nhập một lần, không hiện lại, không ghi vào log. Thao tác
// của một hãng nằm trong "⋯" (kiểm tra kết nối, thay khoá, bật / tắt có Hoàn tác); chỉ khi kết nối lỗi
// thì nút "Thay khoá" hiện sẵn trên dòng. Chọn nhiều để bật / tắt (lặp lệnh từng hãng).
export default async function CarriersPage(props: PageProps<"/sales/shipping/carriers">) {
  const gate = await commerceGate(TAB_PERMISSIONS.carriers);
  if (gate) return gate;
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [{ data: accounts }, orgs] = await Promise.all([
    listCarrierAccounts(),
    unitOptions((type) => type !== "warehouse"),
  ]);
  const codes = Object.entries(CARRIER_CODES).map(([value, label]) => ({ value, label }));
  const undo = { label: t("undo"), done: t("undone") };
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
          <BulkTable
            ids={accounts.map((c) => c.id)}
            actions={[
              {
                key: "off",
                label: t("carriers.turnOff"),
                tone: "danger",
                run: bulkCarrierOffAction,
                undo: undoCarrierOffAction,
              },
              {
                key: "on",
                label: t("carriers.turnOn"),
                run: bulkCarrierOnAction,
                undo: undoCarrierOnAction,
              },
            ]}
          >
            <Table cards>
              <thead>
                <tr>
                  <SelectAllTh />
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
                  const broken = c.check_status === "error";
                  const key = <KeyDialog key="key" id={c.id} name={c.name} primary={broken} />;
                  const menu: RowMenuItem[] = [
                    {
                      label: isOpen ? t("carriers.hideDetail") : t("carriers.openDetail"),
                      href: isOpen
                        ? "/sales/shipping/carriers"
                        : `/sales/shipping/carriers?open=${c.id}#carriers-h`,
                    },
                  ];
                  if (c.active) {
                    menu.push({
                      label: t("carriers.test"),
                      dialog: (
                        <ConfirmAction
                          action={testCarrierAction}
                          id={c.id}
                          label={t("carriers.test")}
                          title={t("carriers.testTitle", { name: c.name })}
                          points={[t("carriers.testAsk"), t("carriers.testNoOrder")]}
                          submit={t("carriers.test")}
                          done={t("carriers.tested")}
                          danger={false}
                        />
                      ),
                    });
                  }
                  if (!broken) menu.push({ label: t("key.button"), dialog: key });
                  menu.push(
                    c.active
                      ? {
                          label: t("carriers.turnOff"),
                          danger: true,
                          change: {
                            action: carrierActiveAction,
                            id: c.id,
                            expect: c.checked_at ?? "",
                            value: "off",
                            done: t("carriers.turnedOff"),
                            undo,
                          },
                        }
                      : {
                          label: t("carriers.turnOn"),
                          change: {
                            action: carrierActiveAction,
                            id: c.id,
                            expect: c.checked_at ?? "",
                            value: "on",
                            done: t("carriers.turnedOn"),
                            undo,
                          },
                        },
                  );
                  return [
                    <tr key={c.id} data-current={isOpen ? "" : undefined}>
                      <SelectTd id={c.id} name={c.name} />
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
                          {broken ? key : null}
                          <RowMenu label={tt("moreFor", { name: c.name })} items={menu} />
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${c.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
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
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <p className="fhint">{t("carriers.foot")}</p>
      </section>
    </div>
  );
}
