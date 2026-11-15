import { getLocale, getTranslations } from "next-intl/server";
import { supplierActiveAction } from "@/app/(admin)/catalog/inventory/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { PurchaseDialog, SupplierDialog } from "@/components/inventory/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { INVENTORY_PURCHASING_MANAGE, INVENTORY_PURCHASING_READ } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listSuppliers } from "@/sample/inventory";
import { commerceGate } from "../../gate";
import { inventoryOptions } from "../options";

// Tab "Nhà cung cấp": mã duy nhất trong khách, điều khoản nợ, số đang nợ đọc từ sổ cái (phải trả
// sau nhập, trả hàng và các khoản đã thanh toán — thanh toán ghi ở phân hệ Tài chính).
export default async function SuppliersPage() {
  const gate = await commerceGate(INVENTORY_PURCHASING_READ);
  if (gate) return gate;
  const [t, locale] = await Promise.all([getTranslations("inventory"), getLocale()]);
  const [{ data: suppliers }, options, manage] = await Promise.all([
    listSuppliers(),
    inventoryOptions(),
    can(INVENTORY_PURCHASING_MANAGE),
  ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const total = suppliers.reduce((n, s) => n + Number(s.payable.amount), 0);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sup-h">
        <div className="block-head">
          <h2 id="sup-h" className="h2">
            {t("suppliers.title")}
          </h2>
          {manage ? <SupplierDialog /> : null}
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("suppliers.supplier")}</Th>
                <Th>{t("suppliers.code")}</Th>
                <Th>{t("suppliers.terms")}</Th>
                <Th className="text-right">{t("suppliers.payable")}</Th>
                <Th>{t("suppliers.state")}</Th>
                <Th>
                  <span className="vh">{t("suppliers.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{s.name}</b>
                      <span className="sub">
                        {s.note}
                        {s.tax_code ? ` · ${t("suppliers.taxCode", { code: s.tax_code })}` : ""}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("suppliers.code")} className="mono">
                    {s.code}
                  </Td>
                  <Td label={t("suppliers.terms")}>
                    {t("suppliers.days", { days: s.payment_terms_days })}
                  </Td>
                  <Td label={t("suppliers.payable")} className="text-right whitespace-nowrap">
                    <span className="cell2">
                      <b>{money(s.payable)}</b>
                      {Number(s.received.amount) > 0 ? (
                        <span className="sub">
                          {t("suppliers.breakdown", {
                            received: money(s.received),
                            returned: money(s.returned),
                            paid: money(s.paid),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td label={t("suppliers.state")}>
                    <span className={s.active ? "badge b-ok" : "badge b-arch"}>
                      <span className="dot" />
                      {s.active ? t("suppliers.active") : t("suppliers.inactive")}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {manage ? (
                      <span className="row-acts">
                        {s.active ? (
                          <PurchaseDialog
                            suppliers={options.suppliers}
                            warehouses={options.warehouses}
                            supplier={s.id}
                          />
                        ) : null}
                        <ChangeButtons
                          action={supplierActiveAction}
                          id={s.id}
                          expect={s.updated_at}
                          moves={[
                            s.active
                              ? {
                                  value: "off",
                                  label: t("suppliers.deactivate"),
                                  done: t("suppliers.deactivated"),
                                }
                              : {
                                  value: "on",
                                  label: t("suppliers.activate"),
                                  done: t("suppliers.activated"),
                                },
                          ]}
                          undo={{ label: t("undo"), done: t("undone") }}
                        />
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("suppliers.foot", { total: formatMoney(total, "VND", locale) })}</p>
      </section>
    </div>
  );
}
