import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  addListingAction,
  startPreviewAction,
  stopPreviewAction,
} from "@/app/(seller)/seller/actions";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { ENDPOINTS_46, SELLER_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { listCategories } from "@/sample/catalog";
import { listSellers, marketName } from "@/sample/market";

// Khối dùng chung của Trung tâm người bán (Server Component): băng "Xem như người bán", bộ chọn gian
// hàng để xem, đầu trang (dòng phạm vi là gian hàng đang xem, nút "Thêm sản phẩm" ở mọi trang như
// bản thiết kế).

/**
 * Băng trên cùng khi quản trị viên "xem như người bán": nói rõ đây là chế độ thử, không phải quyền của
 * người bán; đổi gian hàng hay thoát ngay tại chỗ.
 */
export async function PreviewBar({ current }: { current: string }) {
  const t = await getTranslations("seller.preview");
  const { data: sellers } = await listSellers();
  const name = sellers.find((s) => s.org_id === current)?.display_name ?? "";
  return (
    <aside className="mk-preview" aria-label={t("label")}>
      <p>
        <b>{t("title", { name })}</b> {t("body")}
      </p>
      <form action={startPreviewAction}>
        <label className="vh" htmlFor="mk-preview-pick">
          {t("switch")}
        </label>
        <select id="mk-preview-pick" name="org_id" className="inp" defaultValue={current}>
          {sellers.map((s) => (
            <option key={s.org_id} value={s.org_id}>
              {s.display_name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn sm">
          {t("switch")}
        </button>
      </form>
      <form action={stopPreviewAction}>
        <button type="submit" className="btn sm">
          {t("exit")}
        </button>
      </form>
    </aside>
  );
}

/** Người xem được hồ sơ người bán nhưng chưa chọn gian hàng: chọn để "xem như". */
export async function SellerPicker() {
  const t = await getTranslations("seller");
  const tm = await getTranslations("market");
  const { data: sellers } = await listSellers();
  return (
    <div className="page mk-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("picker.crumb")}</span>
          <h1 className="h1">{t("picker.title")}</h1>
          <p className="pdesc">{t("picker.description")}</p>
          <span className="cat-sample">
            <SampleBadge step="46" endpoint={ENDPOINTS_46} />
          </span>
        </div>
      </section>
      <div className="card tcard">
        <Table cards>
          <thead>
            <tr>
              <Th>{tm("sellers.seller")}</Th>
              <Th>{tm("sellers.state")}</Th>
              <Th>
                <span className="vh">{tm("actions")}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.org_id}>
                <Td className="rt-title">
                  <span className="cell2">
                    <b>{s.display_name}</b>
                    <span className="sub">{tm(`sellerType.${s.seller_type}`)}</span>
                  </span>
                </Td>
                <Td label={tm("sellers.state")}>
                  <span className={SELLER_BADGE[s.status]}>
                    <span className="dot" />
                    {tm(`sellerStatus.${s.status}`)}
                  </span>
                </Td>
                <Td className="rt-acts">
                  <form action={startPreviewAction}>
                    <input type="hidden" name="org_id" value={s.org_id} />
                    <button type="submit" className="btn sm">
                      {tm("sellers.previewAs")}
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

/** Đầu trang của một trang trong Trung tâm người bán. */
export async function SellerHead({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const [t, tm, locale, ctx, market] = await Promise.all([
    getTranslations("seller"),
    getTranslations("market"),
    getLocale(),
    sellerContext(),
    marketName(),
  ]);
  if (!ctx) return null;
  const { data: categories } = await listCategories(locale);
  const s = ctx.seller;
  return (
    <>
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">
            {t("crumb", { name: s.display_name, type: tm(`sellerType.${s.seller_type}`), market })}
          </span>
          <h1 className="h1">{title}</h1>
          <p className="pdesc">{description}</p>
          <span className="cat-sample">
            <SampleBadge step="46" endpoint={ENDPOINTS_46} />
          </span>
        </div>
        {s.status !== "terminated" ? (
          <div className="headacts">
            <FormDialog
              action={addListingAction}
              label={t("products.add")}
              title={t("products.addTitle")}
              intro={t("products.addIntro")}
              submit={t("products.addSubmit")}
              done={t("products.added")}
              triggerClass="btn pri"
              fields={[
                { kind: "text", name: "name", label: t("products.name") },
                {
                  kind: "select",
                  name: "category_id",
                  label: t("products.category"),
                  defaultValue: s.category_id,
                  options: categories.map((c) => ({ value: c.id, label: c.path })),
                },
                {
                  kind: "text",
                  name: "price",
                  label: t("products.price"),
                  mono: true,
                  placeholder: "690000",
                  hint: t("products.priceHint"),
                },
              ]}
            />
          </div>
        ) : null}
      </section>
      {children}
    </>
  );
}
