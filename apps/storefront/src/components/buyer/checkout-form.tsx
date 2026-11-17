"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { AddressOption } from "@/lib/address";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { text } from "@/sample";
import type { CartLine } from "@/sample/cart";
import type { StoreCode } from "@/sample/catalog";
import {
  buildQuote,
  EMPTY_FORM,
  type FieldError,
  type CheckoutForm as FormValues,
  LOYALTY,
  needsAddress,
  PAYMENT_METHODS,
  type PaymentMethod,
  validateCheckout,
  validateDelivery,
} from "@/sample/checkout";
import { type PlaceState, placeOrder } from "@/sample/checkout-actions";
import { sellerBySlug } from "@/sample/market";
import { PICKUP_HOLD_DAYS, PICKUP_PREP_HOURS } from "@/sample/shipping";
import { Icon, type IconName } from "../icon";
import { CartGroups } from "./cart-groups";
import { CheckoutSteps } from "./checkout-steps";
import { DayRange, dayRangeText } from "./day-range";
import { ErrorSummary, ErrorText, errorFor, useErrorText } from "./form-errors";
import { QuoteSummary } from "./quote-summary";
import { useCommunes } from "./use-communes";

// Trang đặt hàng (bước 2 "Giao hàng" và 3 "Thanh toán" của bản thiết kế `Checkout`) trong một form:
// - tổng tiền tính lại ngay trên trình duyệt bằng đúng hàm báo giá của máy chủ (`buildQuote`);
// - mỗi bước kiểm mọi ô một lần, báo "Còn N chỗ cần sửa" và đưa ô lỗi đầu tiên vào giữa màn hình;
// - lúc đặt, máy chủ kiểm lại toàn bộ (giá trên trình duyệt không được tin) và trả lỗi theo trường như
//   Problem `validation_failed` của core;
// - `Idempotency-Key` sinh một lần cho mỗi lần mở trang; nút đặt khoá lại khi đang gửi — bấm hai lần
//   vẫn chỉ một lần đặt.

const DELIVERY_FIELDS = new Set([
  "name",
  "phone",
  "email",
  "pickup_store",
  "province",
  "ward",
  "street",
  "delivery",
]);

export interface PickupStore {
  code: StoreCode;
  name: string;
  address: string;
  hours: string;
}

export interface CheckoutBuyer {
  name: string;
  phone: string;
  points: number;
  tier: string;
  addresses: { id: string; label: string; street: string; province: string; ward: string }[];
}

const PAY_ICON: Record<PaymentMethod, IconName> = { vietqr: "qr", card: "card", cod: "cash" };

export function CheckoutForm({
  locale,
  siteName,
  lines,
  code,
  store,
  buyer,
  pickupStores,
  nowIso,
  idempotencyKey,
  provinces,
}: {
  /** Tỉnh, thành phố của danh mục hành chính (core; phường, xã tải khi chọn tỉnh). */
  provinces: readonly AddressOption[];
  locale: string;
  siteName: string;
  lines: CartLine[];
  code: string | null;
  store: StoreCode;
  buyer: CheckoutBuyer | null;
  pickupStores: PickupStore[];
  /** Giờ của máy chủ lúc dựng trang: ngày giao tính theo đó để hai phía ra cùng một chữ. */
  nowIso: string;
  idempotencyKey: string;
}) {
  const t = useTranslations("checkout");
  const errorText = useErrorText();
  const [step, setStep] = useState<"delivery" | "payment">("delivery");
  const [values, setValues] = useState<FormValues>(() => ({
    ...EMPTY_FORM,
    name: buyer?.name ?? "",
    phone: buyer?.phone ?? "",
    pickup_store: pickupStores.some((s) => s.code === store)
      ? store
      : (pickupStores[0]?.code ?? ""),
  }));
  const { communes, loading: loadingCommunes } = useCommunes(values.province, locale);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [usePoints, setUsePoints] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const [state, action, pending] = useActionState<PlaceState, FormData>(placeOrder, {
    status: "idle",
    errors: [],
  });
  const rootRef = useRef<HTMLFormElement>(null);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const points = usePoints ? values.points : 0;
  const quote = useMemo(
    () =>
      buildQuote({
        lines,
        code,
        store,
        delivery: values.delivery,
        province: values.province || null,
        points,
        balance: buyer?.points ?? null,
        now,
      }),
    [lines, code, store, values.delivery, values.province, points, buyer, now],
  );
  const own = quote.groups.find((g) => g.seller === null);
  const sellerGroups = quote.groups.filter((g) => g.seller !== null);
  const address = needsAddress(quote, values.delivery);
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);

  // Lỗi máy chủ trả về: hiện theo ô; lỗi thuộc bước giao hàng thì quay lại bước đó.
  useEffect(() => {
    if (state.status !== "error") return;
    setErrors(state.errors);
    if (state.errors.some((e) => DELIVERY_FIELDS.has(e.field))) setStep("delivery");
  }, [state]);

  // Có lỗi mới: đưa ô lỗi đầu tiên vào giữa màn hình và đặt con trỏ vào đó.
  useEffect(() => {
    if (errors.length === 0) return;
    const first = rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.scrollIntoView({ block: "center" });
    first?.focus({ preventScroll: true });
  }, [errors]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Sửa ô đang báo lỗi thì lỗi của ô đó biến mất ngay.
    setErrors((list) => list.filter((e) => e.field !== key));
  };

  const goPayment = () => {
    const found = validateDelivery(values, quote);
    setErrors(found);
    if (found.length === 0) {
      setStep("payment");
      window.scrollTo({ top: 0 });
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (step === "delivery") {
      event.preventDefault();
      goPayment();
      return;
    }
    const found = validateCheckout({ ...values, points }, quote, buyer?.points ?? null);
    if (found.length > 0) {
      event.preventDefault();
      setErrors(found);
      if (found.some((e) => DELIVERY_FIELDS.has(e.field))) setStep("delivery");
    }
  };

  const field = (name: keyof FormValues) => {
    const error = errorFor(errors, name);
    return {
      id: `co-${name}`,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `co-${name}-err` : `co-${name}-help`,
      className: error ? "err" : "",
    };
  };

  const province = provinces.find((p) => p.code === values.province);
  const ward = communes.find((w) => w.code === values.ward);
  const deliveryLine =
    own && values.delivery === "pickup"
      ? t("done.pickup", {
          store: pickupStores.find((s) => s.code === values.pickup_store)?.name ?? "",
        })
      : t("done.ship", {
          address: [values.street.trim(), ward?.name ?? "", province?.name ?? ""]
            .filter(Boolean)
            .join(", "),
        });

  const cta = step === "delivery" ? t("next") : t("place", { total: money(quote.total) });

  return (
    <form ref={rootRef} action={action} onSubmit={onSubmit} noValidate className="co-form">
      {/* Dữ liệu gửi lên máy chủ: một chỗ, lấy từ trạng thái của form. */}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {/* Tên tỉnh, phường đi kèm mã: đơn ghi đúng tên đã thấy lúc đặt. */}
      <input type="hidden" name="province_name" value={province?.name ?? ""} />
      <input type="hidden" name="ward_name" value={ward?.name ?? ""} />
      {(Object.keys(values) as (keyof FormValues)[]).map((key) =>
        typeof values[key] === "boolean" ? (
          values[key] ? (
            <input key={key} type="hidden" name={key} value="on" />
          ) : null
        ) : (
          <input
            key={key}
            type="hidden"
            name={key}
            value={key === "points" ? String(points) : String(values[key])}
          />
        ),
      )}
      <div className="co-top">
        <h1 className="dsp co-h1">
          {step === "delivery" ? t("deliveryTitle") : t("paymentTitle")}
        </h1>
        <CheckoutSteps current={step} />
        <span className="co-nextlab muted">
          {step === "delivery" ? t("nextPayment") : t("lastStep")}
        </span>
      </div>
      <button
        type="button"
        className="co-sumbar"
        aria-expanded={sumOpen}
        aria-controls="co-sum"
        onClick={() => setSumOpen((open) => !open)}
      >
        <Icon name="bag" small />
        <span>{sumOpen ? t("hideSummary") : t("showSummary")}</span>
        <Icon name="down" small className="co-sumchev" />
        <b className="price num">{money(quote.total)}</b>
      </button>
      <ErrorSummary errors={errors} />
      <div className="co-cols">
        <div className="co-main">
          <section className="card co-donestep-card" aria-label={t("done.label")}>
            <div className="co-donestep">
              <Icon name="check" small />
              <span className="co-dtext">
                <b>{t("done.cart")}</b>
                <span>
                  {t("done.cartText", {
                    count: lines.reduce((sum, l) => sum + l.quantity, 0),
                    amount: money(quote.subtotal - quote.discount),
                  })}
                  {quote.code?.status === "applied" ? ` · ${quote.code.code}` : ""}
                </span>
              </span>
              <Link className="btn sm" href={routes.cart()} aria-label={t("done.editCart")}>
                {t("done.edit")}
              </Link>
            </div>
            {step === "payment" ? (
              <div className="co-donestep">
                <Icon name="check" small />
                <span className="co-dtext">
                  <b>{t("done.delivery")}</b>
                  <span>
                    {[values.name.trim(), values.phone.trim(), values.email.trim()]
                      .filter(Boolean)
                      .join(" · ")}
                    {". "}
                    {deliveryLine}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn sm"
                  aria-label={t("done.editDelivery")}
                  onClick={() => setStep("delivery")}
                >
                  {t("done.edit")}
                </button>
              </div>
            ) : null}
          </section>

          {step === "delivery" ? (
            <section className="card co-step rise" aria-labelledby="co-recipient">
              {buyer ? (
                <div className="co-who">
                  <Icon name="user" small />
                  <span>
                    {t("signedIn", { name: buyer.name, tier: buyer.tier, points: buyer.points })}
                  </span>
                </div>
              ) : (
                <div className="co-who">
                  <span>{t("guest")}</span>
                  <Link className="btn sm" href={routes.account()}>
                    {t("signIn")}
                  </Link>
                </div>
              )}
              <h2 className="dsp" id="co-recipient">
                {t("recipient")}
              </h2>
              <div className="co-fields">
                <TextField
                  label={t("name")}
                  required
                  autoComplete="name"
                  value={values.name}
                  onChange={(v) => set("name", v)}
                  error={errorFor(errors, "name")}
                  {...field("name")}
                />
                <TextField
                  label={t("phone")}
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xx xxx xxx"
                  value={values.phone}
                  onChange={(v) => set("phone", v)}
                  error={errorFor(errors, "phone")}
                  help={t("phoneHelp")}
                  {...field("phone")}
                />
                <TextField
                  label={t("email")}
                  required={values.invoice}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="ban@example.com"
                  value={values.email}
                  onChange={(v) => set("email", v)}
                  error={errorFor(errors, "email")}
                  help={t("emailHelp")}
                  {...field("email")}
                />
              </div>

              {own ? (
                <fieldset className="co-set">
                  <legend className="dsp co-legend">{t("howTitle", { name: siteName })}</legend>
                  <div className="co-opts">
                    <label className={`opt${values.delivery === "ship" ? " on" : ""}`}>
                      <input
                        type="radio"
                        className="sr-only"
                        name="co-delivery"
                        checked={values.delivery === "ship"}
                        onChange={() => set("delivery", "ship")}
                      />
                      <span className="dotr" aria-hidden="true" />
                      <span className="co-opt-text">
                        <span className="co-opt-name">{t("ship")}</span>
                        <span className="muted">
                          {own.shipping_kind === "free"
                            ? t("shipFree")
                            : own.shipping !== null && values.delivery === "ship"
                              ? t("shipFee", { fee: money(own.shipping) })
                              : t("shipByProvince")}
                        </span>
                        <span className="muted">
                          {own.eta && values.delivery === "ship" ? (
                            <>
                              {t("eta")} <DayRange days={own.eta} locale={locale} />
                            </>
                          ) : (
                            t("etaPick")
                          )}
                        </span>
                      </span>
                      <Icon name="truck" />
                    </label>
                    {pickupStores.length > 0 ? (
                      <label className={`opt${values.delivery === "pickup" ? " on" : ""}`}>
                        <input
                          type="radio"
                          className="sr-only"
                          name="co-delivery"
                          checked={values.delivery === "pickup"}
                          onChange={() => set("delivery", "pickup")}
                        />
                        <span className="dotr" aria-hidden="true" />
                        <span className="co-opt-text">
                          <span className="co-opt-name">{t("pickup")}</span>
                          <span className="muted">
                            {t("pickupNote", { hours: PICKUP_PREP_HOURS, days: PICKUP_HOLD_DAYS })}
                          </span>
                        </span>
                        <Icon name="store" />
                      </label>
                    ) : null}
                  </div>
                  {values.delivery === "pickup" ? (
                    <div className="co-field">
                      <label className="lab" htmlFor="co-pickup_store">
                        {t("pickupStore")}
                        <span className="co-req">{t("required")}</span>
                      </label>
                      <select
                        {...field("pickup_store")}
                        className={`sel ${field("pickup_store").className}`}
                        value={values.pickup_store}
                        onChange={(e) => set("pickup_store", e.target.value)}
                      >
                        <option value="">{t("pickupChoose")}</option>
                        {pickupStores.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name} · {s.hours}
                          </option>
                        ))}
                      </select>
                      <ErrorText
                        id="co-pickup_store-err"
                        error={errorFor(errors, "pickup_store")}
                      />
                      <span className="help" id="co-pickup_store-help">
                        {pickupStores.find((s) => s.code === values.pickup_store)?.address ?? ""}
                      </span>
                    </div>
                  ) : null}
                  {errorFor(errors, "delivery") ? (
                    <ErrorText id="co-delivery-err" error={errorFor(errors, "delivery")} />
                  ) : null}
                </fieldset>
              ) : null}

              {address ? (
                <fieldset className="co-set">
                  <legend className="dsp co-legend">
                    {own && values.delivery === "pickup" ? t("addressSeller") : t("address")}
                  </legend>
                  {buyer && buyer.addresses.length > 0 ? (
                    <fieldset className="chiprow co-saved">
                      <legend className="sr-only">{t("savedAddresses")}</legend>
                      {buyer.addresses.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className={`chip${values.street === a.street && values.ward === a.ward ? " on" : ""}`}
                          aria-pressed={values.street === a.street && values.ward === a.ward}
                          onClick={() => {
                            setValues((v) => ({
                              ...v,
                              province: a.province,
                              ward: a.ward,
                              street: a.street,
                            }));
                            setErrors((list) =>
                              list.filter((e) => !["province", "ward", "street"].includes(e.field)),
                            );
                          }}
                        >
                          <Icon name="pin" small />
                          {a.label}
                        </button>
                      ))}
                    </fieldset>
                  ) : null}
                  <div className="co-fields">
                    <div className="co-field">
                      <label className="lab" htmlFor="co-province">
                        {t("province")}
                        <span className="co-req">{t("required")}</span>
                      </label>
                      <select
                        {...field("province")}
                        className={`sel ${field("province").className}`}
                        autoComplete="address-level1"
                        value={values.province}
                        onChange={(e) => {
                          setValues((v) => ({ ...v, province: e.target.value, ward: "" }));
                          setErrors((list) => list.filter((x) => x.field !== "province"));
                        }}
                      >
                        <option value="">{t("provinceChoose")}</option>
                        {provinces.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <ErrorText id="co-province-err" error={errorFor(errors, "province")} />
                    </div>
                    <div className="co-field">
                      <label className="lab" htmlFor="co-ward">
                        {t("ward")}
                        <span className="co-req">{t("required")}</span>
                      </label>
                      <select
                        {...field("ward")}
                        className={`sel ${field("ward").className}`}
                        autoComplete="address-level2"
                        value={values.ward}
                        disabled={!province || loadingCommunes}
                        onChange={(e) => set("ward", e.target.value)}
                      >
                        <option value="">{province ? t("wardChoose") : t("wardFirst")}</option>
                        {communes.map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                      <ErrorText id="co-ward-err" error={errorFor(errors, "ward")} />
                    </div>
                  </div>
                  <TextField
                    label={t("street")}
                    required
                    autoComplete="street-address"
                    value={values.street}
                    onChange={(v) => set("street", v)}
                    error={errorFor(errors, "street")}
                    help={t("streetHelp")}
                    {...field("street")}
                  />
                  {sellerGroups.map((group) => {
                    const seller = sellerBySlug(group.seller ?? "");
                    return seller ? (
                      <span className="help" key={seller.slug}>
                        {t("sellerShipNote", {
                          seller: seller.display_name,
                          fee: money(group.shipping ?? 0),
                          from: text(seller.ships_from, locale),
                        })}
                        {group.eta ? ` ${t("eta")} ${dayRangeText(group.eta, locale)}.` : ""}
                      </span>
                    ) : null;
                  })}
                </fieldset>
              ) : null}
            </section>
          ) : (
            <section className="card co-step rise" aria-labelledby="co-pay-h">
              {own ? (
                <fieldset className="co-points">
                  <legend>
                    <b>{t("points.title", { name: siteName })}</b>{" "}
                    <span className="muted">
                      {t("points.rate", { value: money(LOYALTY.point_value) })}
                    </span>
                  </legend>
                  {buyer ? (
                    <>
                      <span>
                        {t("points.balance", {
                          points: buyer.points,
                          value: money(buyer.points * LOYALTY.point_value),
                        })}{" "}
                        {quote.points_cap >= LOYALTY.min_redeem_points
                          ? t("points.rule", { cap: quote.points_cap })
                          : t("points.notYet")}
                      </span>
                      {quote.points_cap >= LOYALTY.min_redeem_points ? (
                        <>
                          <label className="co-check">
                            <input
                              type="checkbox"
                              className="chk"
                              checked={usePoints}
                              onChange={(e) => {
                                setUsePoints(e.target.checked);
                                if (e.target.checked && !values.points)
                                  set("points", quote.points_cap);
                              }}
                            />
                            <span>{t("points.use")}</span>
                          </label>
                          {usePoints ? (
                            <div className="co-points-row">
                              <div className="co-field">
                                <label className="lab" htmlFor="co-points">
                                  {t("points.amount")}
                                </label>
                                <input
                                  {...field("points")}
                                  className={`inp num ${field("points").className}`}
                                  inputMode="numeric"
                                  value={values.points ? String(values.points) : ""}
                                  onChange={(e) =>
                                    set(
                                      "points",
                                      Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                                    )
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => set("points", quote.points_cap)}
                              >
                                {t("points.max", { cap: quote.points_cap })}
                              </button>
                              <ErrorText id="co-points-err" error={errorFor(errors, "points")} />
                              {quote.points_used > 0 ? (
                                <span className="by-ok" id="co-points-help">
                                  {t("points.result", {
                                    value: money(quote.points_value),
                                    left: buyer.points - quote.points_used,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="muted">{t("points.guest")}</span>
                  )}
                </fieldset>
              ) : null}

              <fieldset className="co-set">
                <legend className="dsp co-legend" id="co-pay-h">
                  {t("payTitle")}
                </legend>
                <div
                  className="co-opts co-opts-1"
                  id="co-payment"
                  role="radiogroup"
                  aria-labelledby="co-pay-h"
                  tabIndex={-1}
                  aria-invalid={errorFor(errors, "payment") ? true : undefined}
                  aria-describedby="co-payment-err"
                >
                  {PAYMENT_METHODS.map((method) => {
                    const off = method === "cod" && !quote.cod_available;
                    return (
                      <label
                        key={method}
                        className={`opt${values.payment === method ? " on" : ""}${off ? " off" : ""}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name="co-payment"
                          value={method}
                          checked={values.payment === method}
                          disabled={off}
                          onChange={() => set("payment", method)}
                        />
                        <span className="dotr" aria-hidden="true" />
                        <span className="co-opt-text">
                          <span className="co-opt-name">{t(`pay.${method}`)}</span>
                          <span className="muted">
                            {off
                              ? t("pay.codOff", {
                                  sellers: sellerGroups
                                    .filter((g) => !g.cod)
                                    .map((g) => sellerBySlug(g.seller ?? "")?.display_name ?? "")
                                    .join(", "),
                                })
                              : t(`pay.${method}Note`)}
                          </span>
                        </span>
                        <Icon name={PAY_ICON[method]} />
                      </label>
                    );
                  })}
                </div>
                <ErrorText id="co-payment-err" error={errorFor(errors, "payment")} />
                <p className="co-paynote">
                  <Icon name="shield" small />
                  <span>
                    {sellerGroups.length > 0
                      ? t("payNoteMarket", { name: siteName })
                      : t("payNote", { name: siteName })}
                  </span>
                </p>
              </fieldset>

              <div className="co-set">
                <label className="co-check">
                  <input
                    type="checkbox"
                    className="chk"
                    checked={values.invoice}
                    onChange={(e) => set("invoice", e.target.checked)}
                  />
                  <span>{t("invoice")}</span>
                </label>
                {values.invoice ? (
                  <div className="co-fields co-invoice">
                    <TextField
                      label={t("taxCode")}
                      required
                      inputMode="numeric"
                      value={values.tax_code}
                      onChange={(v) => set("tax_code", v)}
                      error={errorFor(errors, "tax_code")}
                      help={t("taxCodeHelp")}
                      {...field("tax_code")}
                    />
                    <TextField
                      label={t("company")}
                      autoComplete="organization"
                      value={values.company}
                      onChange={(v) => set("company", v)}
                      help={t("companyHelp")}
                      {...field("company")}
                    />
                    <TextField
                      label={t("invoiceEmail")}
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={values.email}
                      onChange={(v) => set("email", v)}
                      error={errorFor(errors, "email")}
                      help={t("invoiceEmailHelp")}
                      {...field("email")}
                      id="co-invoice-email"
                    />
                  </div>
                ) : null}
              </div>

              <div className="co-set co-consents">
                <label className="co-check">
                  <input
                    type="checkbox"
                    className="chk"
                    id="co-terms"
                    checked={values.terms}
                    aria-invalid={errorFor(errors, "terms") ? true : undefined}
                    aria-describedby="co-terms-err"
                    onChange={(e) => set("terms", e.target.checked)}
                  />
                  <span>
                    {t("terms", { name: siteName })} <span className="co-req">{t("required")}</span>
                  </span>
                </label>
                <ErrorText id="co-terms-err" error={errorFor(errors, "terms")} />
                <label className="co-check">
                  <input
                    type="checkbox"
                    className="chk"
                    checked={values.marketing}
                    onChange={(e) => set("marketing", e.target.checked)}
                  />
                  <span>{t("marketing")}</span>
                </label>
                <span className="help">{t("dataNote", { name: siteName })}</span>
              </div>
            </section>
          )}

          <CartGroups groups={quote.groups} locale={locale} siteName={siteName} editable={false} />

          <div className="co-nav">
            {step === "payment" ? (
              <button
                type="button"
                className="btn ghost"
                aria-label={t("back")}
                onClick={() => setStep("delivery")}
              >
                <Icon name="left" small />
                <span className="hide-mobile">{t("back")}</span>
              </button>
            ) : (
              <Link className="btn ghost" href={routes.cart()} aria-label={t("backCart")}>
                <Icon name="left" small />
                <span className="hide-mobile">{t("backCart")}</span>
              </Link>
            )}
            <span className="only-mobile co-nav-total">
              <span className="muted">{t("summary.total")}</span>
              <b className="price num">{money(quote.total)}</b>
            </span>
            <button type="submit" className="btn pri" disabled={pending} aria-busy={pending}>
              {pending ? t("placing") : cta}
            </button>
          </div>
        </div>
        <aside
          id="co-sum"
          className={`card co-sum${sumOpen ? " open" : ""}`}
          aria-labelledby="co-sum-h"
        >
          <h2 className="dsp" id="co-sum-h">
            {t("summaryTitle")}
          </h2>
          <QuoteSummary
            quote={quote}
            locale={locale}
            siteName={siteName}
            delivery={values.delivery}
          >
            {errors.length > 0 ? (
              <span className="errtxt" role="status">
                {errorText({ field: "", code: "summary", params: { count: errors.length } })}
              </span>
            ) : null}
          </QuoteSummary>
        </aside>
      </div>
    </form>
  );
}

function TextField({
  id,
  label,
  required = false,
  value,
  onChange,
  error,
  help,
  className,
  ...input
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: FieldError | undefined;
  help?: string;
  className: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id" | "className">) {
  const t = useTranslations("checkout");
  return (
    <div className="co-field">
      <label className="lab" htmlFor={id}>
        {label}
        <span className={required ? "co-req" : "co-opt"}>
          {required ? t("required") : t("optional")}
        </span>
      </label>
      <input
        {...input}
        id={id}
        className={`inp ${className}`}
        value={value}
        aria-describedby={error ? `${id}-err` : help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <ErrorText id={`${id}-err`} error={error} />
      {help && !error ? (
        <span className="help" id={`${id}-help`}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
