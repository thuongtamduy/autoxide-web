import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { priceListActiveAction } from "@/app/(admin)/catalog/actions";
import { PRICE_BADGE } from "@/components/catalog/badges";
import { PriceDialog, PriceListDialog } from "@/components/catalog/forms";
import { ResolveForm } from "@/components/catalog/price-tools";
import { ChangeButtons } from "@/components/engage/actions";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CATALOG_PRICES_WRITE, toVietnamInput } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  allVariants,
  listPriceLists,
  priceHistory,
  storePrices,
  VARIANT_ID,
} from "@/sample/catalog";
import { listUnits } from "@/sample/org";
import { vietnamDay } from "@/sample/tax";

// Tab "Bảng giá": trụ sở đặt giá cho cả chuỗi, cửa hàng kế thừa hay ghi đè; dòng giá chỉ thêm, có
// ngày hiệu lực (luôn biết giá ngay trước một chương trình khuyến mại). "Giá giải ra vì sao" cho
// nhân viên và AI agent kiểm bảng nào thắng.
export default async function PricesPage(props: PageProps<"/catalog/prices">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("catalog"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const [{ data: lists }, { data: units }, { data: variants }, write] = await Promise.all([
    listPriceLists(),
    listUnits(),
    allVariants(locale),
    can(CATALOG_PRICES_WRITE),
  ]);
  const stores = units.filter((u) => u.unit_type === "store");
  const store =
    stores.find((s) => s.id === one("store")) ??
    stores.find((s) => s.name.includes("Cầu Giấy")) ??
    stores[0];
  const variant =
    variants.find((v) => v.variant_id === one("variant")) ??
    variants.find((v) => v.variant_id === VARIANT_ID.CG26) ??
    variants[0];
  const [{ data: matrix }, history] = await Promise.all([
    store ? storePrices(store.id, locale) : Promise.resolve({ data: [] }),
    variant ? priceHistory(variant.variant_id) : Promise.resolve({ data: [] }),
  ]);
  const open = one("open");
  const money = (amount: string, currency: string) => formatMoney(amount, currency, locale);
  const listOptions = lists.map((l) => ({ value: l.id, label: `${l.name} · ${l.org_name}` }));
  const variantName = (v: (typeof variants)[number]) =>
    `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""} · ${v.sku}`;
  const tomorrow = `${toVietnamInput(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10)}T00:00`;
  const href = (change: Record<string, string>) => {
    const next = new URLSearchParams({
      ...(store ? { store: store.id } : {}),
      ...(variant ? { variant: variant.variant_id } : {}),
      ...change,
    });
    return `/catalog/prices?${next}`;
  };
  const overrides = store ? lists.find((l) => l.org_id === store.id && l.active) : undefined;

  return (
    <div className="blocks">
      <p className="fhint">{t("prices.about")}</p>
      <section className="block" aria-labelledby="lists-h">
        <div className="block-head">
          <h2 id="lists-h" className="h2">
            {t("prices.listsTitle")}
          </h2>
          {write ? (
            <>
              <PriceListDialog
                units={units
                  .filter((u) => u.unit_type !== "warehouse")
                  .map((u) => ({ value: u.id, label: u.name }))}
              />
              <PriceDialog
                lists={listOptions}
                from={tomorrow}
                reference={`gia-${vietnamDay()}`}
                triggerClass="btn sm pri"
              />
            </>
          ) : null}
        </div>
        <p className="fhint">{t("prices.listsAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("prices.list")}</Th>
                <Th>{t("prices.node")}</Th>
                <Th>{t("prices.audienceCol")}</Th>
                <Th className="text-right">{t("prices.priority")}</Th>
                <Th>{t("prices.state")}</Th>
                <Th>
                  <span className="vh">{t("prices.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id} data-current={open === l.id ? "" : undefined}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{l.name}</b>
                      <span className="sub">
                        {t("prices.rows", { rows: l.price_count, variants: l.variant_count })}
                        {l.customer_group
                          ? ` · ${t("prices.group", { group: l.customer_group })}`
                          : ""}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("prices.node")}>{l.org_name}</Td>
                  <Td label={t("prices.audienceCol")}>
                    <span className="cell2">
                      {t(`prices.audience.${l.audience}`)}
                      <span className="sub">
                        {l.currency} · {l.tax_inclusive ? t("prices.taxIncl") : t("prices.taxExcl")}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("prices.priority")} className="text-right">
                    {l.priority}
                  </Td>
                  <Td label={t("prices.state")}>
                    <span className={l.active ? "badge b-ok" : "badge b-arch"}>
                      <span className="dot" />
                      {l.active ? t("prices.on") : t("prices.off")}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {write ? (
                      <span className="row-acts">
                        <PriceDialog
                          lists={listOptions}
                          list={l.id}
                          from={tomorrow}
                          reference={`gia-${vietnamDay()}`}
                          label={t("prices.add.short")}
                        />
                        <ChangeButtons
                          action={priceListActiveAction}
                          id={l.id}
                          expect={l.updated_at}
                          moves={[
                            l.active
                              ? {
                                  value: "off",
                                  label: t("prices.turnOff"),
                                  done: t("prices.turnedOff"),
                                  tone: "danger",
                                }
                              : {
                                  value: "on",
                                  label: t("prices.turnOn"),
                                  done: t("prices.turnedOn"),
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
      </section>

      <section className="block" aria-labelledby="store-h">
        <div className="block-head">
          <h2 id="store-h" className="h2">
            {t("prices.storeTitle")}
          </h2>
        </div>
        <p className="fhint">{t("prices.storeAbout")}</p>
        <nav className="chips" aria-label={t("prices.storePick")}>
          {stores.map((s) => (
            <Link
              key={s.id}
              className={s.id === store?.id ? "chip on" : "chip"}
              href={`${href({ store: s.id })}#store-h`}
              aria-current={s.id === store?.id ? "page" : undefined}
              scroll={false}
            >
              {s.name}
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("prices.variant")}</Th>
                <Th className="text-right">{t("prices.price")}</Th>
                <Th>{t("prices.source")}</Th>
                <Th>
                  <span className="vh">{t("prices.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => {
                const winner = row.resolution.candidates.find((c) => c.outcome === "winner");
                return (
                  <tr
                    key={row.variant_id}
                    data-override={row.source === "override" ? "" : undefined}
                  >
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={`${href({ variant: row.variant_id })}#history`}
                          scroll={false}
                        >
                          {row.product_name}
                          {row.label ? ` · ${row.label}` : ""}
                        </Link>
                        <span className="sub mono">{row.sku}</span>
                      </span>
                    </Td>
                    <Td label={t("prices.price")} className="text-right whitespace-nowrap">
                      {row.resolution.price
                        ? money(
                            row.resolution.price.amount.amount,
                            row.resolution.price.amount.currency,
                          )
                        : "—"}
                    </Td>
                    <Td label={t("prices.source")}>
                      {row.source === "override" && winner ? (
                        <span className="badge b-info">
                          {t("prices.override", { list: winner.name })}
                        </span>
                      ) : row.source === "inherited" && winner ? (
                        <span className="muted">
                          {t("prices.inherited", { list: winner.name, node: winner.org_name })}
                        </span>
                      ) : (
                        <span className="badge b-warn">{t("prices.none")}</span>
                      )}
                    </Td>
                    <Td className="rt-acts">
                      {write && overrides && store ? (
                        <PriceDialog
                          lists={listOptions}
                          list={overrides.id}
                          code={row.sku}
                          from={tomorrow}
                          reference={`gia-${store.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${row.sku.toLowerCase()}-${vietnamDay()}`}
                          label={
                            row.source === "override"
                              ? t("prices.changeOverride")
                              : t("prices.overrideButton")
                          }
                        />
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        {!overrides && store ? (
          <p className="fhint">{t("prices.noStoreList", { store: store.name })}</p>
        ) : null}
      </section>

      <section className="block" aria-labelledby="history">
        <div className="block-head">
          <h2 id="history" className="h2">
            {t("prices.historyTitle", { name: variant ? variantName(variant) : "—" })}
          </h2>
          <form action="/catalog/prices" className="inline-row cat-pick">
            {store ? <input type="hidden" name="store" value={store.id} /> : null}
            <label className="vh" htmlFor="history-variant">
              {t("prices.variant")}
            </label>
            <select
              id="history-variant"
              className="inp"
              name="variant"
              defaultValue={variant?.variant_id}
            >
              {variants.map((v) => (
                <option key={v.variant_id} value={v.variant_id}>
                  {variantName(v)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn sm">
              {t("prices.show")}
            </button>
          </form>
        </div>
        <p className="fhint">{t("prices.appendOnly")}</p>
        <div className="card tcard">
          {history.data.length === 0 ? (
            <p className="empty">{t("prices.noHistory")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th className="text-right">{t("prices.price")}</Th>
                  <Th>{t("prices.list")}</Th>
                  <Th>{t("prices.valid")}</Th>
                  <Th>{t("prices.by")}</Th>
                  <Th>{t("prices.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((p) => (
                  <tr key={p.id}>
                    <Td className="rt-title text-right">
                      <span className="cell2">
                        <b>{money(p.amount.amount, p.amount.currency)}</b>
                        <span className="sub">
                          {p.compare_at
                            ? t("prices.compare", {
                                amount: money(p.compare_at.amount, p.compare_at.currency),
                              })
                            : ""}{" "}
                          <span className="mono">{p.reference}</span>
                        </span>
                      </span>
                    </Td>
                    <Td label={t("prices.list")}>
                      {lists.find((l) => l.id === p.price_list_id)?.name ?? p.price_list_id}
                    </Td>
                    <Td label={t("prices.valid")}>
                      <Time value={p.valid_from} />
                      {p.valid_to ? (
                        <>
                          {" – "}
                          <Time value={p.valid_to} />
                        </>
                      ) : null}
                    </Td>
                    <Td label={t("prices.by")}>{p.created_by.name}</Td>
                    <Td label={t("prices.state")}>
                      <span className={PRICE_BADGE[p.state]}>
                        <span className="dot" />
                        {t(`prices.states.${p.state}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <p className="fhint">
          {t("prices.historyFoot", { count: formatCount(history.data.length, locale) })}
        </p>
      </section>

      <section className="block half" aria-labelledby="resolve-h">
        <div className="block-head">
          <h2 id="resolve-h" className="h2">
            {t("prices.resolve.title")}
          </h2>
        </div>
        <p className="fhint">{t("prices.resolve.about")}</p>
        <ResolveForm
          variants={variants.map((v) => ({ value: v.variant_id, label: variantName(v) }))}
          stores={stores.map((s) => ({ value: s.id, label: s.name }))}
          defaults={{
            variant_id: variant?.variant_id ?? "",
            org_id: store?.id ?? "",
            at: toVietnamInput(new Date().toISOString()),
          }}
        />
      </section>
      <section className="block half" aria-labelledby="legal-h">
        <h2 id="legal-h" className="h2">
          {t("prices.legalTitle")}
        </h2>
        <p className="note">
          <b>{t("prices.legalStrong")}</b> {t("prices.legal")}
        </p>
      </section>
    </div>
  );
}
