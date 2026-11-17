import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkRestockSerialsAction,
  bulkWriteOffLotsAction,
  bulkWriteOffSerialsAction,
  restockSerialAction,
  writeOffLotAction,
  writeOffSerialAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { LOT_BADGE, SERIAL_BADGE } from "@/components/catalog/badges";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay, INVENTORY_ADJUST } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { readPage, readSort, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import { LOT_SORTS, listLots, listSerials } from "@/sample/inventory";

const BASE = "/catalog/inventory/lots";

// Tab "Lô và serial": bật theo sản phẩm. Xuất kho tự chọn lô hết hạn trước; lô quá hạn bị job hằng
// ngày trừ khỏi tồn. Serial: mỗi chiếc bán một lần; hàng khách trả chờ kiểm rồi cho bán lại hay
// loại bỏ. Bộ bảng chuẩn (W-058): bảng lô chọn nhiều để loại bỏ, sắp theo mã lô / hạn / số còn, phân
// trang có tổng, "⋯" mở sổ biến động của dòng tồn; bảng serial chọn nhiều để bán lại / loại bỏ, dòng
// hiện "Bán lại", "Loại bỏ" vào "⋯" (danh sách serial chưa sắp được nên không bật sắp).
export default async function LotsPage(props: PageProps<"/catalog/inventory/lots">) {
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const sorted = typeof params.sort === "string" && params.sort !== "";
  const sort = readSort(params, LOT_SORTS, { field: "expires", dir: "asc" });
  const paging = readPage(params);
  const keep = sorted ? { sort: sort.field, dir: sort.dir } : {};
  const [{ data: listed }, { data: serials }, adjust] = await Promise.all([
    listLots(locale, sorted ? sort : null),
    listSerials(locale),
    can(INVENTORY_ADJUST),
  ]);
  const page = slicePage(listed, paging.page, paging.per);
  const lots = page.data;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="lots-h">
        <div className="block-head">
          <h2 id="lots-h" className="h2">
            {t("lots.title")}
          </h2>
        </div>
        <p className="fhint">{t("lots.about")}</p>
        <div className="card tcard">
          <BulkTable
            ids={lots.map((lot) => lot.id)}
            actions={
              adjust
                ? [
                    {
                      key: "write-off",
                      label: t("lots.writeOff"),
                      tone: "danger",
                      run: bulkWriteOffLotsAction,
                      confirm: {
                        title: t("lots.bulkWriteOffTitle"),
                        points: [t("lots.bulkWriteOffPoint"), t("lots.writeOffFinal")],
                        submit: t("lots.writeOffSubmit"),
                      },
                    },
                  ]
                : []
            }
          >
            <Table cards>
              <thead>
                <tr>
                  {adjust ? <SelectAllTh /> : null}
                  <SortTh field="lot" sort={sort} base={BASE} keep={keep}>
                    {t("lots.lot")}
                  </SortTh>
                  <Th>{t("lots.variant")}</Th>
                  <SortTh field="expires" sort={sort} base={BASE} keep={keep}>
                    {t("lots.expires")}
                  </SortTh>
                  <SortTh
                    field="left"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("lots.left")}
                  </SortTh>
                  <Th>{t("lots.state")}</Th>
                  <Th>
                    <span className="vh">{t("lots.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    {adjust ? <SelectTd id={lot.id} name={lot.lot_code} /> : null}
                    <Td className="rt-title mono">{lot.lot_code}</Td>
                    <Td label={t("lots.variant")}>
                      <span className="cell2">
                        {lot.name}
                        <span className="sub">
                          {lot.org_name}
                          {lot.receipt_number ? ` · ${lot.receipt_number}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("lots.expires")}>
                      {lot.expires_on ? formatDay(lot.expires_on, locale) : "—"}
                    </Td>
                    <Td label={t("lots.left")} className="text-right">
                      {formatCount(lot.on_hand, locale)}
                    </Td>
                    <Td label={t("lots.state")}>
                      <span className={LOT_BADGE[lot.status]}>
                        <span className="dot" />
                        {t(`lotStatus.${lot.status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="row-acts">
                        {adjust && lot.on_hand > 0 && lot.status !== "fresh" ? (
                          <ConfirmAction
                            action={writeOffLotAction}
                            id={lot.id}
                            label={t("lots.writeOff")}
                            title={t("lots.writeOffTitle", { lot: lot.lot_code })}
                            points={[
                              t("lots.writeOffPoint", { count: lot.on_hand }),
                              t("lots.writeOffFinal"),
                            ]}
                            submit={t("lots.writeOffSubmit")}
                            done={t("lots.writtenOff")}
                          />
                        ) : null}
                        <RowMenu
                          label={tt("moreFor", { name: lot.lot_code })}
                          items={[
                            {
                              label: t("levels.viewLedger"),
                              href: `/catalog/inventory/moves?level=${lot.level_id}`,
                            },
                          ]}
                        />
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>

      <section className="block" aria-labelledby="serials-h">
        <div className="block-head">
          <h2 id="serials-h" className="h2">
            {t("serials.title")}
          </h2>
        </div>
        <p className="fhint">{t("serials.about")}</p>
        <div className="card tcard">
          <BulkTable
            ids={serials.map((s) => s.id)}
            texts={Object.fromEntries(serials.map((s) => [s.id, s.serial]))}
            actions={[
              ...(adjust
                ? [
                    {
                      key: "restock",
                      label: t("serials.restock"),
                      run: bulkRestockSerialsAction,
                    },
                    {
                      key: "write-off",
                      label: t("serials.writeOff"),
                      tone: "danger" as const,
                      run: bulkWriteOffSerialsAction,
                      confirm: {
                        title: t("serials.bulkWriteOffTitle"),
                        points: [t("serials.writeOffPoint")],
                        submit: t("serials.writeOffSubmit"),
                      },
                    },
                  ]
                : []),
              { key: "copy", label: t("serials.copy"), copy: true },
            ]}
          >
            <Table cards>
              <thead>
                <tr>
                  <SelectAllTh />
                  <Th>{t("serials.serial")}</Th>
                  <Th>{t("serials.variant")}</Th>
                  <Th>{t("serials.where")}</Th>
                  <Th>{t("serials.state")}</Th>
                  <Th>
                    <span className="vh">{t("serials.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {serials.map((s) => (
                  <tr key={s.id}>
                    <SelectTd id={s.id} name={s.serial} />
                    <Td className="rt-title mono">{s.serial}</Td>
                    <Td label={t("serials.variant")}>{s.name}</Td>
                    <Td label={t("serials.where")}>
                      <span className="cell2">
                        {s.status === "sold" ? t("serials.shipped") : s.org_name}
                        {s.order_number || s.note ? (
                          <span className="sub">
                            {[s.order_number, s.note].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("serials.state")}>
                      <span className={SERIAL_BADGE[s.status]}>
                        <span className="dot" />
                        {t(`serialStatus.${s.status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {adjust && s.status === "returned" ? (
                        <span className="row-acts">
                          <ConfirmAction
                            action={restockSerialAction}
                            id={s.id}
                            label={t("serials.restock")}
                            title={t("serials.restockTitle", { serial: s.serial })}
                            points={[t("serials.restockPoint", { where: s.org_name })]}
                            submit={t("serials.restockSubmit")}
                            done={t("serials.restocked")}
                            danger={false}
                          />
                          <RowMenu
                            label={tt("moreFor", { name: s.serial })}
                            items={[
                              {
                                label: t("serials.writeOff"),
                                danger: true,
                                dialog: (
                                  <ConfirmAction
                                    action={writeOffSerialAction}
                                    id={s.id}
                                    label={t("serials.writeOff")}
                                    title={t("serials.writeOffTitle", { serial: s.serial })}
                                    points={[t("serials.writeOffPoint")]}
                                    submit={t("serials.writeOffSubmit")}
                                    done={t("serials.writtenOff")}
                                  />
                                ),
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
      </section>
      <p className="note warn" role="note">
        <b>{t("lots.legalStrong")}</b> {t("lots.legal")}
      </p>
    </div>
  );
}
