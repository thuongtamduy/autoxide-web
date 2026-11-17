import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AllocationDialog } from "@/components/channels/forms";
import { BlockHead, Cell2, param } from "@/components/growth/blocks";
import { AutoFilter } from "@/components/ui/auto-filter";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { CHANNELS_MANAGE } from "@/lib/channels";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { variantByCode } from "@/sample/catalog";
import { listAllocations, stockPreview } from "@/sample/channels";
import { CHANNEL_TABS } from "../shared";

const PREVIEW_SKUS = ["NI20", "CG26", "DB3", "HT1L", "CG24"] as const;

// Tab "Phân bổ tồn": tồn bán được trên một kênh tính từ tồn khả dụng ở các kho gắn với tài khoản (đọc từ
// Tồn kho). "Theo tỉ lệ" không giữ hàng; "Giữ riêng" giữ thật trong kho để website và kênh khác không bán
// vào. Tồn đổi thì gộp các thay đổi trong 5 giây rồi đẩy một lần; mỗi 6 giờ đối chiếu toàn bộ. Dòng
// hiện một nút (sửa phân bổ); "⋯" chỉ dẫn sang tài khoản kênh. Không có thao tác hàng loạt: mỗi phân bổ
// có số riêng, và hàm mẫu (như core bước 48) chỉ lưu từng phân bổ.
export default async function StockPage(props: PageProps<"/sales/channels/stock">) {
  if (!(await can(CHANNEL_TABS.stock))) notFound();
  const [t, tt, locale, params, allocations, manage] = await Promise.all([
    getTranslations("channels"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    listAllocations(),
    can(CHANNELS_MANAGE),
  ]);
  const sku = PREVIEW_SKUS.find((s) => s === param(params, "sku")) ?? "NI20";
  const options = await Promise.all(PREVIEW_SKUS.map((s) => variantByCode(s)));
  const variant = options.find((o) => o.data?.sku === sku)?.data ?? null;
  const preview = variant ? await stockPreview(variant.variant_id) : null;
  const pct = (bp: number) => `${formatCount(bp / 100, locale)}%`;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="alloc-h">
        <BlockHead id="alloc-h" title={t("stock.title")} about={t("stock.about")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("stock.account")}</Th>
                <Th>{t("stock.appliesTo")}</Th>
                <Th>{t("stock.mode")}</Th>
                <Th className="text-right">{t("stock.share")}</Th>
                <Th className="text-right">{t("stock.reserved")}</Th>
                <Th className="text-right">{t("stock.buffer")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {allocations.data.map((a) => (
                <tr key={a.id}>
                  <Td className="rt-title">
                    <Cell2
                      main={a.account_name}
                      sub={`${t(`kinds.${a.kind}`)} · ${t(`accountState.${a.status}`)}`}
                    />
                  </Td>
                  <Td label={t("stock.appliesTo")}>{a.variant_name ?? t("stock.allProducts")}</Td>
                  <Td label={t("stock.mode")}>{t(`alloc.modes.${a.mode}`)}</Td>
                  <Td label={t("stock.share")} className="text-right num">
                    {a.mode === "share" ? pct(a.share_bp) : "—"}
                  </Td>
                  <Td label={t("stock.reserved")} className="text-right num">
                    {a.mode === "reserved" ? formatCount(a.reserved_qty, locale) : "—"}
                  </Td>
                  <Td label={t("stock.buffer")} className="text-right num">
                    {formatCount(a.buffer_qty, locale)}
                  </Td>
                  <Td className="rt-acts">
                    <span className="row-acts">
                      {manage ? (
                        <AllocationDialog
                          allocation={{
                            id: a.id,
                            account: a.account_name,
                            target: a.variant_name ?? t("stock.allProducts"),
                            mode: a.mode,
                            share: a.share_bp / 100,
                            reserved: a.reserved_qty,
                            buffer: a.buffer_qty,
                            variant: a.variant_id !== null,
                          }}
                        />
                      ) : null}
                      <RowMenu
                        label={tt("moreFor", {
                          name: `${a.account_name} · ${a.variant_name ?? t("stock.allProducts")}`,
                        })}
                        items={[
                          {
                            label: t("stock.openAccount"),
                            href: `/sales/channels?open=${a.account_id}#ch-accounts-h`,
                          },
                        ]}
                      />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="preview-h">
        <BlockHead id="preview-h" title={t("stock.previewTitle")} about={t("stock.previewAbout")} />
        <form className="filters" action="/sales/channels/stock">
          <AutoFilter />
          <div className="fld grow">
            <label className="lab" htmlFor="stock-sku">
              {t("stock.product")}
            </label>
            <select id="stock-sku" className="inp" name="sku" defaultValue={sku}>
              {options.map((o) =>
                o.data ? (
                  <option key={o.data.sku} value={o.data.sku}>
                    {o.data.name}
                  </option>
                ) : null,
              )}
            </select>
          </div>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("stock.preview")}
            </button>
          </div>
        </form>
        {preview && variant ? (
          <>
            <div className="card tcard">
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("stock.channel")}</Th>
                    <Th>{t("stock.how")}</Th>
                    <Th className="text-right">{t("stock.push")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.account_id}>
                      <Td className="rt-title">
                        <Cell2 main={r.account_name} sub={t(`kinds.${r.kind}`)} />
                      </Td>
                      <Td label={t("stock.how")}>
                        {r.push === null
                          ? t("stock.noPush", { state: t(`accountState.${r.status}`) })
                          : r.mode === "reserved"
                            ? t("stock.howReserved", { n: r.reserved_qty })
                            : t("stock.howShare", {
                                available: r.available,
                                reserved: preview.reserved,
                                pct: pct(r.share_bp),
                                buffer: r.buffer_qty,
                              })}
                      </Td>
                      <Td label={t("stock.push")} className="text-right num">
                        {r.push === null ? "—" : formatCount(r.push, locale)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="fhint">
              {t("stock.previewFoot", {
                name: variant.name,
                available: preview.available,
                reserved: preview.reserved,
                website: preview.website,
              })}
            </p>
          </>
        ) : null}
      </section>
      <section className="block half" aria-label={t("stock.warnTitle")}>
        <p className="note warn">
          <b>{t("stock.warnTitle")}</b> {t("stock.warnText")}
        </p>
        <p className="fhint">{t("stock.debounce")}</p>
      </section>
    </div>
  );
}
