import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkRemindAction,
  remindAction,
  undoBulkRemindAction,
} from "@/app/(admin)/sales/orders/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Pager } from "@/components/ui/pager";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { ORDERS_MANAGE } from "@/lib/orders";
import { readPage, readSort, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import { CART_SORTS, canRemindCart, listCarts, MAX_CART_REMINDERS } from "@/sample/orders";
import { ORDER_TABS } from "../../shared";

const BASE = "/sales/orders/carts";

// Tab "Giỏ hàng bỏ dở": giỏ có hàng mà người mua chưa đặt trong 30 ngày. Chỉ nhắc người mua đã đồng ý
// nhận tin (Luật Bảo vệ dữ liệu cá nhân 91/2025, NĐ 13/2023 — cần đối chiếu văn bản gốc), mỗi giỏ tối
// đa 2 lần; liên hệ hiện đã che. Chọn nhiều giỏ để nhắc một lần (lặp lệnh từng giỏ; giỏ không nhắc
// được báo lỗi riêng dòng, Hoàn tác huỷ các lần nhắc chưa gửi); sắp theo giá trị, giờ bỏ dở.
export default async function CartsPage(props: PageProps<"/sales/orders/carts">) {
  if (!(await can(ORDER_TABS.carts))) notFound();
  const [t, locale, params] = await Promise.all([
    getTranslations("orders"),
    getLocale(),
    props.searchParams,
  ]);
  const sorted = typeof params.sort === "string";
  const sort = readSort(params, CART_SORTS, { field: "abandoned", dir: "desc" });
  const paging = readPage(params);
  const [carts, manage] = await Promise.all([listCarts(sorted ? sort : null), can(ORDERS_MANAGE)]);
  const page = slicePage(carts.data, paging.page, paging.per);
  const keep = sorted ? { sort: sort.field, dir: sort.dir } : {};
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
          <BulkTable
            ids={page.data.map((c) => c.id)}
            actions={
              manage
                ? [
                    {
                      key: "remind",
                      label: t("carts.remind"),
                      tone: "pri",
                      run: bulkRemindAction,
                      undo: undoBulkRemindAction,
                    },
                  ]
                : []
            }
          >
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <Th>{t("carts.buyer")}</Th>
                  <Th>{t("carts.reminders")}</Th>
                  <Th>{t("carts.items")}</Th>
                  <SortTh
                    field="value"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("carts.value")}
                  </SortTh>
                  <SortTh field="abandoned" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("carts.abandoned")}
                  </SortTh>
                  <Th>
                    <span className="vh">{t("carts.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((c) => (
                  <tr key={c.id}>
                    {manage ? <SelectTd id={c.id} name={c.buyer_name} /> : null}
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
                      {manage && canRemindCart(c) ? (
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
                ))}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
        <p className="fhint">{t("carts.template")}</p>
      </section>
    </div>
  );
}
