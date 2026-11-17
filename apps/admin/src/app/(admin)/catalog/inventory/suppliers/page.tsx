import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkSupplierOffAction,
  bulkSupplierOnAction,
  supplierActiveAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { PurchaseDialog, SupplierDialog } from "@/components/inventory/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { INVENTORY_PURCHASING_MANAGE, INVENTORY_PURCHASING_READ } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import { listSuppliers, SUPPLIER_SORTS } from "@/sample/inventory";
import { commerceGate } from "../../gate";
import { inventoryOptions } from "../options";

// Tab "Nhà cung cấp": mã duy nhất trong khách, điều khoản nợ, số đang nợ đọc từ sổ cái (phải trả
// sau nhập, trả hàng và các khoản đã thanh toán — thanh toán ghi ở phân hệ Tài chính). Dòng hiện một
// nút phụ (tạo đơn mua), còn lại trong "⋯"; chọn nhiều để ngừng / giao dịch lại; sắp theo tên, mã, số nợ.
export default async function SuppliersPage(props: PageProps<"/catalog/inventory/suppliers">) {
  const gate = await commerceGate(INVENTORY_PURCHASING_READ);
  if (gate) return gate;
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const sort = readSort(params, SUPPLIER_SORTS, { field: "name", dir: "asc" });
  const paging = readPage(params);
  const keep = typeof params.sort === "string" ? { sort: sort.field, dir: sort.dir } : {};
  const BASE = "/catalog/inventory/suppliers";
  const [{ data: listed }, options, manage] = await Promise.all([
    listSuppliers(typeof params.sort === "string" ? sort : null),
    inventoryOptions(),
    can(INVENTORY_PURCHASING_MANAGE),
  ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const total = listed.reduce((n, s) => n + Number(s.payable.amount), 0);
  const page = slicePage(listed, paging.page, paging.per);
  const suppliers = page.data;
  const undo = { label: t("undo"), done: t("undone") };
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
          <BulkTable
            ids={suppliers.map((s) => s.id)}
            actions={
              manage
                ? [
                    { key: "off", label: t("suppliers.deactivate"), run: bulkSupplierOffAction },
                    { key: "on", label: t("suppliers.activate"), run: bulkSupplierOnAction },
                  ]
                : []
            }
          >
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <SortTh field="name" sort={sort} base={BASE} keep={keep}>
                    {t("suppliers.supplier")}
                  </SortTh>
                  <SortTh field="code" sort={sort} base={BASE} keep={keep}>
                    {t("suppliers.code")}
                  </SortTh>
                  <Th>{t("suppliers.terms")}</Th>
                  <SortTh
                    field="payable"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("suppliers.payable")}
                  </SortTh>
                  <Th>{t("suppliers.state")}</Th>
                  <Th>
                    <span className="vh">{t("suppliers.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    {manage ? <SelectTd id={s.id} name={s.name} /> : null}
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
                          <RowMenu
                            label={tt("moreFor", { name: s.name })}
                            items={[
                              s.active
                                ? {
                                    label: t("suppliers.deactivate"),
                                    change: {
                                      action: supplierActiveAction,
                                      id: s.id,
                                      expect: s.updated_at,
                                      value: "off",
                                      done: t("suppliers.deactivated"),
                                      undo,
                                    },
                                  }
                                : {
                                    label: t("suppliers.activate"),
                                    change: {
                                      action: supplierActiveAction,
                                      id: s.id,
                                      expect: s.updated_at,
                                      value: "on",
                                      done: t("suppliers.activated"),
                                      undo,
                                    },
                                  },
                            ]}
                          />
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
        <p className="fhint">{t("suppliers.foot", { total: formatMoney(total, "VND", locale) })}</p>
      </section>
    </div>
  );
}
