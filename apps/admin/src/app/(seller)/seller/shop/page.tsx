import { getTranslations } from "next-intl/server";
import { InlineForm } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { sellerContext } from "@/lib/seller";
import { marketName } from "@/sample/market";
import { payoutAccountAction, updateShopAction } from "../actions";

// Thông tin gian hàng (hiện công khai trên trang người bán theo luật TMĐT), cách giao hàng, và tài
// khoản nhận tiền — số tài khoản đi thẳng vào kho secret, không bao giờ hiện lại.
export default async function SellerShop() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, market] = await Promise.all([
    getTranslations("seller.shop"),
    getTranslations("market"),
    marketName(),
  ]);
  const s = ctx.seller;
  return (
    <div className="mk-two">
      <section className="block card cp-pad" aria-labelledby="sl-shop-h">
        <h2 id="sl-shop-h" className="h2">
          {t("info")}
        </h2>
        <InlineForm
          action={updateShopAction}
          submit={t("save")}
          done={t("saved")}
          fields={[
            { kind: "text", name: "display_name", label: t("name"), defaultValue: s.display_name },
            {
              kind: "text",
              name: "slug",
              label: t("slug"),
              mono: true,
              defaultValue: s.slug,
              hint: t("slugHint", { market, slug: s.slug }),
            },
            {
              kind: "textarea",
              name: "description",
              label: t("about"),
              defaultValue: s.description,
            },
            {
              kind: "text",
              name: "pickup_address",
              label: t("pickup"),
              defaultValue: s.pickup_address,
            },
            {
              kind: "select",
              name: "fulfillment",
              label: t("fulfillment"),
              defaultValue: s.fulfillment,
              options: (["self", "platform"] as const).map((m) => ({
                value: m,
                label: tm(`fulfillment.${m}`),
              })),
            },
            {
              kind: "select",
              name: "cod_enabled",
              label: t("cod"),
              hint: t("codHint"),
              defaultValue: s.cod_enabled ? "on" : "off",
              options: [
                { value: "on", label: t("codOn") },
                { value: "off", label: t("codOff") },
              ],
            },
          ]}
        />
      </section>
      <section className="block card cp-pad" aria-labelledby="sl-payout-h">
        <h2 id="sl-payout-h" className="h2">
          {t("payout")}
        </h2>
        <p className="fhint">
          {s.payout_account ? (
            <>
              {tm("sellers.accountMasked", {
                bank: s.payout_account.bank_name,
                last4: s.payout_account.number_last4,
              })}{" "}
              · {s.payout_account.holder_name} · <Time value={s.payout_account.updated_at} date />
            </>
          ) : (
            tm("sellers.accountMissing")
          )}
        </p>
        <p className="note">{t("payoutNote")}</p>
        <InlineForm
          action={payoutAccountAction}
          submit={t("payoutSave")}
          done={t("payoutSaved")}
          fields={[
            {
              kind: "text",
              name: "bank_name",
              label: t("bank"),
              defaultValue: s.payout_account?.bank_name ?? "",
            },
            {
              kind: "text",
              name: "holder_name",
              label: t("holder"),
              hint: t("holderHint"),
              defaultValue: s.payout_account?.holder_name ?? "",
            },
            {
              kind: "text",
              name: "account_number",
              label: t("number"),
              mono: true,
              hint: t("numberHint"),
            },
          ]}
        />
      </section>
    </div>
  );
}
