import { getLocale, getTranslations } from "next-intl/server";
import {
  restockSerialAction,
  writeOffLotAction,
  writeOffSerialAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { LOT_BADGE, SERIAL_BADGE } from "@/components/catalog/badges";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay, INVENTORY_ADJUST } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listLots, listSerials } from "@/sample/inventory";

// Tab "Lô và serial": bật theo sản phẩm. Xuất kho tự chọn lô hết hạn trước; lô quá hạn bị job hằng
// ngày trừ khỏi tồn. Serial: mỗi chiếc bán một lần; hàng khách trả chờ kiểm rồi cho bán lại hay
// loại bỏ.
export default async function LotsPage() {
  const [t, locale] = await Promise.all([getTranslations("inventory"), getLocale()]);
  const [{ data: lots }, { data: serials }, adjust] = await Promise.all([
    listLots(locale),
    listSerials(locale),
    can(INVENTORY_ADJUST),
  ]);
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
          <Table cards>
            <thead>
              <tr>
                <Th>{t("lots.lot")}</Th>
                <Th>{t("lots.variant")}</Th>
                <Th>{t("lots.expires")}</Th>
                <Th className="text-right">{t("lots.left")}</Th>
                <Th>{t("lots.state")}</Th>
                <Th>
                  <span className="vh">{t("lots.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
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
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="serials-h">
        <div className="block-head">
          <h2 id="serials-h" className="h2">
            {t("serials.title")}
          </h2>
        </div>
        <p className="fhint">{t("serials.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
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
                        <ConfirmAction
                          action={writeOffSerialAction}
                          id={s.id}
                          label={t("serials.writeOff")}
                          title={t("serials.writeOffTitle", { serial: s.serial })}
                          points={[t("serials.writeOffPoint")]}
                          submit={t("serials.writeOffSubmit")}
                          done={t("serials.writtenOff")}
                        />
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
      <p className="note warn" role="note">
        <b>{t("lots.legalStrong")}</b> {t("lots.legal")}
      </p>
    </div>
  );
}
