import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { activateAction } from "@/app/(admin)/marketing/promotions/actions";
import { FlashPriceDialog } from "@/components/promotions/forms";
import { Meter } from "@/components/promotions/meter";
import { Checks, STATUS_BADGE } from "@/components/promotions/views";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";
import {
  bpPercent,
  PROMOTIONS_PUBLISH,
  PROMOTIONS_WRITE,
  usedPercent,
  vnRange,
} from "@/lib/promotions";
import { can } from "@/lib/viewer";
import { getPromotion, listFlashItems, listFlashPromotions } from "@/sample/promotions";

// Tab "Flash sale": suất theo từng biến thể, giữ khi đặt hàng và trả lại khi huỷ như tồn kho. Đầu tab
// là các điều kiện hệ thống kiểm khi bật (trần pháp luật, giá ngay trước khuyến mại, thông báo, mục
// tiêu); dòng vượt trần có nút sửa về giá thấp nhất được phép.
export default async function FlashPage(props: PageProps<"/marketing/promotions/flash">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("promotions"),
    getLocale(),
    props.searchParams,
  ]);
  const { data: flashes } = await listFlashPromotions(locale);
  const wanted = typeof params.id === "string" ? params.id : "";
  const current = flashes.find((f) => f.id === wanted) ?? flashes[0];
  if (!current) {
    return <p className="empty">{t("flash.none")}</p>;
  }
  const [detail, items, write, publish] = await Promise.all([
    getPromotion(current.id, locale),
    listFlashItems(current.id, locale),
    can(PROMOTIONS_WRITE),
    can(PROMOTIONS_PUBLISH),
  ]);
  const rows = items?.data ?? [];
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const total = rows.reduce((sum, r) => sum + r.quantity_limit, 0);
  const editable = current.status === "draft" && write;
  return (
    <div className="blocks">
      {flashes.length > 1 ? (
        <nav className="chips" aria-label={t("flash.pick")}>
          {flashes.map((f) => (
            <Link
              key={f.id}
              className={f.id === current.id ? "chip on" : "chip"}
              href={`/marketing/promotions/flash?id=${f.id}`}
              aria-current={f.id === current.id ? "page" : undefined}
            >
              {f.title}
            </Link>
          ))}
        </nav>
      ) : null}
      <section className="block" aria-labelledby="flash-h">
        <div className="block-head">
          <h2 id="flash-h" className="h2">
            {current.title}
          </h2>
          <span className={STATUS_BADGE[current.status]}>
            <span className="dot" />
            {t(`status.${current.status}`)}
          </span>
        </div>
        <p className="fhint">
          {t("flash.about", {
            window: vnRange(current.starts_at, current.ends_at, locale),
            slots: formatCount(total, locale),
          })}
        </p>
        {detail ? (
          <>
            <h3 className="pm-h">{t("checks.title")}</h3>
            <p className="fhint">{t("checks.about")}</p>
            <Checks checks={detail.data.checks} locale={locale} />
          </>
        ) : null}
        {publish && current.status === "draft" ? (
          <span className="row-acts">
            <ConfirmAction
              action={activateAction}
              id={current.id}
              label={t("actions.activate")}
              title={t("actions.activateTitle", { title: current.title })}
              points={[
                t("actions.activateChecks"),
                t("actions.activateLocked"),
                t("actions.activateVersion"),
              ]}
              submit={t("actions.activateSubmit")}
              done={t("actions.activated")}
              danger={false}
            />
          </span>
        ) : null}
      </section>

      <section className="block" aria-labelledby="slots-h">
        <div className="block-head">
          <h2 id="slots-h" className="h2">
            {t("flash.slots")}
          </h2>
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("flash.variant")}</Th>
                <Th className="text-right">{t("flash.price")}</Th>
                <Th>{t("flash.sold")}</Th>
                <Th>{t("flash.cap")}</Th>
                <Th>
                  <span className="vh">{t("flash.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variant_id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <span>{r.name}</span>
                      <span className="sub mono">{r.sku}</span>
                    </span>
                  </Td>
                  <Td label={t("flash.price")} className="text-right">
                    <span className="cell2">
                      <b className="num">{r.sale_price ? money(r.sale_price.amount) : "—"}</b>
                      <span className="sub">
                        {t("flash.from", {
                          price: r.reference ? money(r.reference.amount) : "—",
                          percent: r.discount_bp === null ? "—" : bpPercent(r.discount_bp, locale),
                        })}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("flash.sold")}>
                    <Meter
                      label={t("flash.soldOf", {
                        used: formatCount(r.quantity_used, locale),
                        limit: formatCount(r.quantity_limit, locale),
                      })}
                      percent={usedPercent(r.quantity_used, r.quantity_limit)}
                    />
                  </Td>
                  <Td label={t("flash.cap")}>
                    <span className="cell2">
                      <span className={r.over_limit ? "badge b-bad" : "badge b-ok"}>
                        <span className="dot" />
                        {r.over_limit ? t("flash.over") : t("flash.within")}
                      </span>
                      {r.lowest_allowed ? (
                        <span className="sub">
                          {t("flash.lowest", { price: money(r.lowest_allowed.amount) })}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {editable ? (
                      <FlashPriceDialog
                        id={current.id}
                        variantId={r.variant_id}
                        name={r.name}
                        price={
                          r.over_limit && r.lowest_allowed
                            ? r.lowest_allowed.amount
                            : (r.sale_price?.amount ?? "")
                        }
                        quantity={r.quantity_limit}
                        reference={r.reference ? money(r.reference.amount) : "—"}
                        lowest={r.lowest_allowed ? money(r.lowest_allowed.amount) : "—"}
                        primary={r.over_limit}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">
          {t("flash.foot", {
            parts: rows.map((r) => formatCount(r.quantity_limit, locale)).join(" + "),
            total: formatCount(total, locale),
          })}
        </p>
        {current.status !== "draft" ? <p className="fhint">{t("flash.locked")}</p> : null}
      </section>
    </div>
  );
}
