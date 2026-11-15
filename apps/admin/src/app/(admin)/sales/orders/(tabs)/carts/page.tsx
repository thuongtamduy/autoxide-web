import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { remindAction } from "@/app/(admin)/sales/orders/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { ORDERS_MANAGE } from "@/lib/orders";
import { can } from "@/lib/viewer";
import { listCarts, MAX_CART_REMINDERS } from "@/sample/orders";
import { ORDER_TABS } from "../../shared";

// Tab "Giỏ hàng bỏ dở": giỏ có hàng mà người mua chưa đặt trong 30 ngày. Chỉ nhắc người mua đã đồng ý
// nhận tin (Luật Bảo vệ dữ liệu cá nhân 91/2025, NĐ 13/2023 — cần đối chiếu văn bản gốc), mỗi giỏ tối
// đa 2 lần; liên hệ hiện đã che.
export default async function CartsPage() {
  if (!(await can(ORDER_TABS.carts))) notFound();
  const [t, locale, carts, manage] = await Promise.all([
    getTranslations("orders"),
    getLocale(),
    listCarts(),
    can(ORDERS_MANAGE),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="carts-h">
        <div className="block-head">
          <h2 id="carts-h" className="h2">
            {t("carts.title")}
          </h2>
        </div>
        <p className="fhint">{t("carts.about", { max: MAX_CART_REMINDERS })}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("carts.buyer")}</Th>
                <Th>{t("carts.reminders")}</Th>
                <Th>{t("carts.items")}</Th>
                <Th className="text-right">{t("carts.value")}</Th>
                <Th>{t("carts.abandoned")}</Th>
                <Th>
                  <span className="vh">{t("carts.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {carts.data.map((c) => {
                const canRemind =
                  c.consent && c.contact !== null && c.reminders_sent < MAX_CART_REMINDERS;
                return (
                  <tr key={c.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <span>{c.buyer_name}</span>
                        <span className="sub">
                          {c.contact ?? t("carts.noContact")} · {c.org_name}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("carts.reminders")}>
                      <span
                        className={
                          !c.consent
                            ? "badge b-arch"
                            : c.reminders_sent > 0
                              ? "badge b-info"
                              : "badge b-warn"
                        }
                      >
                        {!c.consent || !c.contact
                          ? t("carts.cannot")
                          : c.reminders_sent > 0
                            ? t("carts.sent", { n: c.reminders_sent })
                            : t("carts.notYet")}
                      </span>
                    </Td>
                    <Td label={t("carts.items")}>
                      <span className="cell2">
                        <span>
                          {t("carts.count", { n: c.lines.reduce((s, l) => s + l.quantity, 0) })}
                        </span>
                        <span className="sub">
                          {c.lines.map((l) => `${l.name} × ${l.quantity}`).join(", ")}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("carts.value")} className="text-right num">
                      {money(c.value.amount)}
                    </Td>
                    <Td label={t("carts.abandoned")}>
                      <Time value={c.abandoned_at} />
                    </Td>
                    <Td className="rt-acts">
                      {manage && canRemind ? (
                        <ChangeButtons
                          action={remindAction}
                          id={c.id}
                          expect=""
                          moves={[
                            {
                              value: "remind",
                              label: t("carts.remind"),
                              done: t("carts.reminded", { name: c.buyer_name }),
                            },
                          ]}
                          undo={{ label: t("undo"), done: t("carts.unreminded") }}
                        />
                      ) : (
                        <span className="sub">
                          {!c.consent || !c.contact
                            ? t("carts.noConsent")
                            : t("carts.limit", { max: MAX_CART_REMINDERS })}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("carts.template")}</p>
      </section>
    </div>
  );
}
