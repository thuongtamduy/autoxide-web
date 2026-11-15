"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { countdown, vietnamTime } from "@/lib/countdown";
import { deliveryWindow, shippingFee, vietnamDay } from "@/lib/delivery";
import { formatMoney } from "@/lib/format";
import { discountPercent } from "@/lib/promo";
import { addToCart, chooseStore } from "@/sample/actions";
import { ART, type ArtName, Icon, type IconName, type Tone } from "../icon";
import { Price } from "../price";

/** Tình trạng một biến thể ở một cửa hàng (như `availability` của dữ liệu mẫu, bước 42). */
export type StockLevel =
  | { kind: "in_store" | "low"; left: number }
  | { kind: "out" }
  | { kind: "warehouse" };

export interface BuyVariant {
  sku: string;
  label: string | null;
  price: number;
  /** Giá khi nhập mã công khai (`null`: mã không áp). */
  couponPrice: number | null;
  serves: string | null;
  stock: Record<string, StockLevel>;
  /** Flash sale có biến thể này: giá, giá tham chiếu, giờ. */
  flash: { sale: number; reference: number; starts: number; ends: number; left: number } | null;
}

export interface BuyStore {
  code: string;
  name: string;
  hours: string;
  pickup: boolean;
}

export interface BuyAddon {
  sku: string;
  name: string;
  price: number;
  art: ArtName;
  tone: Tone;
}

export interface BuyBoxProps {
  name: string;
  locale: string;
  optionName: string | null;
  variants: BuyVariant[];
  initialSku: string;
  store: string;
  stores: BuyStore[];
  coupon: { code: string; endsOn: string; remaining: number; terms: string } | null;
  zones: { code: string; name: string; fee: number; days: readonly [number, number] }[];
  freeFrom: number;
  pickup: { readyHours: number; holdDays: number };
  /** Hàng của người bán trên sàn: người bán giao, không nhận tại cửa hàng. */
  sellerShips: boolean;
  addons: BuyAddon[];
  perks: { icon: IconName; title: string; text: string }[];
  /** Giờ của máy chủ khi dựng trang: lần dựng đầu ở trình duyệt khớp HTML của máy chủ. */
  now: number;
  checkoutPath: string;
}

const MAX_QTY = 10;

function useToast(): [string, (text: string) => void] {
  const [toast, setToast] = useState("");
  const say = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  };
  return [toast, say];
}

/**
 * Khối mua của trang sản phẩm (bản thiết kế `Product`): giá (giá niêm yết, giá với mã, flash sale kèm
 * giá tham chiếu), chọn biến thể, cách nhận hàng (giao tận nơi có ngày dự kiến cụ thể, nhận tại cửa
 * hàng theo tồn của cửa hàng đang chọn), số lượng, thêm vào giỏ, mua ngay, hàng dùng kèm. Biến thể
 * đang chọn ghi lên địa chỉ (`?sku=`) để chia sẻ được.
 */
export function BuyBox(props: BuyBoxProps) {
  const t = useTranslations("pdp.buy");
  const tw = useTranslations("time");
  const router = useRouter();
  const [sku, setSku] = useState(props.initialSku);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<"ship" | "pickup">("ship");
  const [zone, setZone] = useState(props.zones[0]?.code ?? "");
  const [allStores, setAllStores] = useState(false);
  const [now, setNow] = useState(props.now);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [toast, say] = useToast();
  const [pending, start] = useTransition();

  // Giờ chốt đơn và đếm ngược flash sale cập nhật mỗi phút.
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const variant = props.variants.find((v) => v.sku === sku) ?? props.variants[0];
  if (!variant) return null;
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, props.locale);
  const flash = variant.flash ? countdown(now, variant.flash.starts, variant.flash.ends) : null;
  const flashOn = variant.flash !== null && flash?.phase === "running";
  const unit = flashOn && variant.flash ? variant.flash.sale : variant.price;
  const line = unit * qty;
  const storeInfo = props.stores.find((s) => s.code === props.store) ?? props.stores[0];
  const here = variant.stock[props.store] ?? { kind: "warehouse" };
  const canPickup =
    !props.sellerShips &&
    (storeInfo?.pickup ?? false) &&
    (here.kind === "in_store" || here.kind === "low") &&
    here.left >= qty;
  const effectiveMode = mode === "pickup" && canPickup ? "pickup" : "ship";
  const zoneInfo = props.zones.find((z) => z.code === zone) ?? props.zones[0];
  const days: [number, number] = zoneInfo
    ? [
        zoneInfo.days[0] + (props.sellerShips ? 1 : 0),
        zoneInfo.days[1] + (props.sellerShips ? 1 : 0),
      ]
    : [2, 4];
  const window_ = deliveryWindow(now, days);
  const fee = shippingFee(line, zoneInfo?.fee ?? 0, props.freeFrom);
  const dayText = (at: number, short: boolean) => {
    const d = vietnamDay(at);
    return `${tw(`${short ? "s" : "l"}${d.weekday}`)} ${d.dayMonth}`;
  };
  const range = (short: boolean) =>
    `${dayText(window_.from, short)} – ${dayText(window_.to, short)}`;

  const pick = (next: string) => {
    setSku(next);
    setQty(1);
    // Ghi biến thể lên địa chỉ, không tạo mục lịch sử mới (Next.js đồng bộ với `replaceState`).
    const url = new URL(window.location.href);
    url.searchParams.set("sku", next);
    window.history.replaceState(null, "", url);
  };
  const stockText = (level: StockLevel) =>
    level.kind === "in_store"
      ? t("stockIn")
      : level.kind === "low"
        ? t("stockLow", { left: level.left })
        : level.kind === "out"
          ? t("stockOut")
          : t("stockNone");
  const stockTone = (level: StockLevel) =>
    level.kind === "in_store" ? "ok" : level.kind === "low" ? "sale" : "warn";

  const add = (skus: string[], quantity: number, done: string, then?: () => void) =>
    start(async () => {
      const count = await addToCart(skus, quantity);
      if (count === null) return;
      say(done);
      then?.();
    });
  const addMain = () => {
    if (mode === "pickup" && !canPickup) {
      setAllStores(true);
      say(t("pickupBlocked", { store: storeInfo?.name ?? "" }));
      return;
    }
    add(
      [variant.sku],
      qty,
      t("added", { count: qty, name: `${props.name}${variant.label ? ` ${variant.label}` : ""}` }),
    );
  };
  const buyNow = () =>
    add([variant.sku], qty, t("added", { count: qty, name: props.name }), () =>
      router.push(props.checkoutPath),
    );

  return (
    <>
      <div className="pp-price">
        <span className="pp-price-row">
          <Price
            money={{ amount: unit, currency: "VND" }}
            locale={props.locale}
            sale={flashOn}
            className="dsp pp-big"
          />
          {flashOn && variant.flash ? (
            <>
              <Price
                money={{ amount: variant.flash.reference, currency: "VND" }}
                locale={props.locale}
                was
              />
              <span className="badge b-sale">
                −{discountPercent(variant.flash.reference, variant.flash.sale)}%
              </span>
            </>
          ) : variant.couponPrice !== null && props.coupon ? (
            <span className="badge b-sale pp-codepill">
              {t("withCode", { price: money(variant.couponPrice), code: props.coupon.code })}
            </span>
          ) : null}
        </span>
        <span className="muted pp-note">{t("vat")}</span>
        {flashOn && variant.flash ? (
          <span className="muted pp-note">
            {t("flashRunning", {
              time: vietnamTime(variant.flash.ends),
              left: variant.flash.left,
              reference: money(variant.flash.reference),
            })}
          </span>
        ) : variant.flash && flash?.phase === "upcoming" ? (
          <span className="pp-note pp-flashsoon">
            <Icon name="bolt" small />
            {t("flashSoon", {
              price: money(variant.flash.sale),
              time: vietnamTime(variant.flash.starts),
              days: flash.days,
              hours: flash.hours,
            })}
          </span>
        ) : null}
        {props.coupon && !flashOn ? (
          <details className="pp-cond">
            <summary>
              {t("conditions")}
              <Icon name="down" small />
            </summary>
            <span>
              {variant.couponPrice !== null
                ? t("couponTerms", {
                    off: money(variant.price - variant.couponPrice),
                    code: props.coupon.code,
                    until: props.coupon.endsOn,
                    remaining: props.coupon.remaining,
                  })
                : t("couponNotThis", { code: props.coupon.code, until: props.coupon.endsOn })}{" "}
              {props.coupon.terms}
            </span>
          </details>
        ) : null}
      </div>

      {props.variants.length > 1 ? (
        <div className="pp-sizes">
          <span className="lab" id="pp-opt">
            {props.optionName ?? t("option")}: {variant.label}
            {variant.serves ? ` · ${t("serves", { range: variant.serves })}` : ""}
          </span>
          <fieldset className="pp-sizegrid" aria-labelledby="pp-opt">
            {props.variants.map((v) => (
              <label key={v.sku} className={`pp-size${v.sku === variant.sku ? " on" : ""}`}>
                <input
                  type="radio"
                  className="pp-radio"
                  name="pp-variant"
                  value={v.sku}
                  checked={v.sku === variant.sku}
                  onChange={() => pick(v.sku)}
                />
                <span className="pp-zt">
                  <b>{v.label}</b>
                  {v.serves ? (
                    <>
                      <span className="pp-zdot" aria-hidden="true">
                        ·
                      </span>
                      <span>{t("serves", { range: v.serves })}</span>
                    </>
                  ) : null}
                </span>
                <Price
                  money={{ amount: v.price, currency: "VND" }}
                  locale={props.locale}
                  className="pp-zp"
                />
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}

      <div className="pp-recv">
        <span className="lab" id="pp-recv-h">
          {t("receive")}
        </span>
        <fieldset aria-labelledby="pp-recv-h" className="pp-opts">
          <label className={`opt${effectiveMode === "ship" ? " on" : ""}`}>
            <input
              type="radio"
              className="pp-radio"
              name="pp-mode"
              value="ship"
              checked={effectiveMode === "ship"}
              onChange={() => setMode("ship")}
            />
            <span className="dotr" />
            <span className="pp-optt">
              <span className="pp-optn">{props.sellerShips ? t("shipSeller") : t("ship")}</span>
              <span className="muted pp-opts-sub">
                {fee.fee === 0 ? t("freeShip") : money(fee.fee)} · {t("eta")}{" "}
                <span className="pp-dll">{range(false)}</span>
                <span className="pp-dls">{range(true)}</span>
              </span>
            </span>
            <Icon name="truck" />
          </label>
          {effectiveMode === "ship" ? (
            <div className="pp-sub">
              <label className="pp-zone">
                <span className="lab">{t("shipTo")}</span>
                <select
                  className="sel"
                  value={zone}
                  aria-label={t("zone")}
                  onChange={(event) => setZone(event.target.value)}
                >
                  {props.zones.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="muted">
                {window_.cutoffIn !== null
                  ? t("cutoff", {
                      hours: Math.floor(window_.cutoffIn / 60),
                      minutes: window_.cutoffIn % 60,
                    })
                  : t("cutoffPassed")}
              </span>
              {fee.missing > 0 ? (
                <>
                  <span>{t("freeMissing", { amount: money(fee.missing) })}</span>
                  <div className="pp-bar" aria-hidden="true">
                    <span style={{ width: `${fee.progress}%` }} />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {props.sellerShips ? null : (
            <label
              className={`opt${effectiveMode === "pickup" ? " on" : ""}${canPickup ? "" : " pp-off"}`}
            >
              {/* Không đủ hàng thì vẫn bấm được (không `disabled`): bấm là mở danh sách cửa hàng khác; dòng phụ nói lý do. */}
              <input
                type="radio"
                className="pp-radio"
                name="pp-mode"
                value="pickup"
                checked={effectiveMode === "pickup"}
                onChange={() => {
                  if (!canPickup) {
                    setAllStores(true);
                    say(t("pickupBlocked", { store: storeInfo?.name ?? "" }));
                    return;
                  }
                  setMode("pickup");
                }}
              />
              <span className="dotr" />
              <span className="pp-optt">
                <span className="pp-optn">{t("pickup", { store: storeInfo?.name ?? "" })}</span>
                <span className={`pp-opts-sub av-${canPickup ? "muted" : "warn"}`}>
                  {!storeInfo?.pickup
                    ? t("noPickupHere")
                    : canPickup
                      ? `${stockText(here)} · ${t("readyIn", { hours: props.pickup.readyHours })}`
                      : stockText(here)}
                </span>
              </span>
              <Icon name="store" />
            </label>
          )}
          {effectiveMode === "pickup" ? (
            <div className="pp-sub">{t("pickupHold", { days: props.pickup.holdDays })}</div>
          ) : null}
        </fieldset>
        {props.sellerShips ? null : (
          <div className="pp-links">
            {here.kind === "out" || here.kind === "warehouse" ? (
              <button type="button" className="lnk" onClick={() => say(t("notifySample"))}>
                <Icon name="clock" small />
                {t("notify")}
              </button>
            ) : null}
            <button
              type="button"
              className="lnk"
              aria-expanded={allStores}
              aria-controls="pp-stores"
              onClick={() => setAllStores(!allStores)}
            >
              {allStores ? t("hideStores") : t("otherStores")}
            </button>
          </div>
        )}
        {allStores && !props.sellerShips ? (
          <ul id="pp-stores" className="pp-storelist">
            {props.stores.map((s) => {
              const level = variant.stock[s.code] ?? { kind: "warehouse" };
              const available = level.kind === "in_store" || level.kind === "low";
              return (
                <li key={s.code}>
                  <span className="pp-st-name">
                    <b>{s.name}</b>
                    <span className="muted">{t("opens", { hours: s.hours })}</span>
                  </span>
                  <span className={`pp-st-stock av-${stockTone(level)}`}>{stockText(level)}</span>
                  {s.code !== props.store && available && s.pickup ? (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await chooseStore(s.code);
                          setMode("pickup");
                          setAllStores(false);
                          say(t("storeChosen", { store: s.name }));
                        })
                      }
                    >
                      {t("choose")}
                    </button>
                  ) : s.code === props.store ? (
                    <span className="badge b-brand">{t("yourStore")}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="pp-buyrow">
        <fieldset className="pp-qty">
          <legend className="sr-only">{t("quantity")}</legend>
          <button
            type="button"
            className="btn ghost sq"
            aria-label={t("less")}
            disabled={qty <= 1}
            onClick={() => setQty(Math.max(1, qty - 1))}
          >
            <Icon name="minus" small />
          </button>
          <span className="num" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="btn ghost sq"
            aria-label={t("more")}
            disabled={qty >= MAX_QTY}
            onClick={() => setQty(Math.min(MAX_QTY, qty + 1))}
          >
            <Icon name="plus" small />
          </button>
        </fieldset>
        <button
          type="button"
          className="btn pri hide-mobile pp-add"
          disabled={pending}
          onClick={addMain}
        >
          {t("addToCart")} · <span className="price">{money(line)}</span>
        </button>
        <button
          type="button"
          className="btn hide-mobile pp-buynow"
          disabled={pending}
          onClick={buyNow}
        >
          {t("buyNow")}
        </button>
        <span className="only-mobile muted pp-subtotal">
          {t("subtotal")} <b className="price">{money(line)}</b>
        </span>
      </div>

      {props.addons.length > 0 ? (
        <div className="pp-addw">
          <span className="lab" id="pp-addons-h">
            {t("addons")}
          </span>
          <ul className="pp-addons" aria-labelledby="pp-addons-h">
            {props.addons.map((addon) => (
              <li className="pp-addon" key={addon.sku}>
                <span className={`thumb ${addon.tone}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={ART[addon.art]} />
                  </svg>
                </span>
                <span className="pp-ao">
                  <b>{addon.name}</b>
                  <Price
                    money={{ amount: addon.price, currency: "VND" }}
                    locale={props.locale}
                    className="muted"
                  />
                </span>
                <button
                  type="button"
                  className={`btn sm${added[addon.sku] ? "" : " pri"}`}
                  aria-label={t("addNamed", { name: addon.name })}
                  disabled={pending || added[addon.sku]}
                  onClick={() =>
                    add([addon.sku], 1, t("added", { count: 1, name: addon.name }), () =>
                      setAdded({ ...added, [addon.sku]: true }),
                    )
                  }
                >
                  <Icon name={added[addon.sku] ? "check" : "plus"} small />
                  {added[addon.sku] ? t("addedShort") : t("add")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pp-perkw">
        <ul className="perks pp-perks">
          {props.perks.map((perk) => (
            <li key={perk.title}>
              <Icon name={perk.icon} small />
              <span>
                <b>{perk.title}</b>
                <span className="muted">{perk.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <section className="buybar only-mobile pp-buybar" aria-label={t("quickBuy")}>
        <span className="pp-bb-t">
          <span className="ell muted">
            {variant.label ? `${variant.label} · ` : ""}
            {t("qtyShort", { count: qty })}
          </span>
          <b className="price">{money(line)}</b>
        </span>
        <button type="button" className="btn" disabled={pending} onClick={buyNow}>
          {t("buyNow")}
        </button>
        <button type="button" className="btn pri" disabled={pending} onClick={addMain}>
          {t("addToCart")}
        </button>
      </section>

      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      ) : null}
    </>
  );
}
