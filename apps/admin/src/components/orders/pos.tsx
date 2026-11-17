"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type PosCustomer,
  type PosQuote,
  posCustomersAction,
  posQuoteAction,
  posSaleAction,
} from "@/app/(admin)/sales/orders/actions";
import { useReason } from "@/components/promotions/reason";
import { FormAlert } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import {
  cartTotals,
  cashSuggestions,
  findByScan,
  fitCart,
  HELD_KEY,
  type HeldCart,
  matchItem,
  type PosCart,
  type PosLineItem,
  parseCash,
  readHeld,
  setQuantity,
} from "@/lib/pos";

export interface PosItem extends PosLineItem {
  category: { id: string; name: string } | null;
}

export interface PosStore {
  id: string;
  name: string;
  shift: { id: string; register: string; cashier: string; since: string } | null;
  items: PosItem[];
}

const METHODS = ["cash", "card_terminal", "vietqr"] as const;
const MAX_CODES = 5;

/** Ô vuông chữ cái đầu thay cho ảnh sản phẩm; màu theo nhóm hàng để mắt tìm nhanh. */
function tone(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

function useStored(): [HeldCart[], (next: HeldCart[]) => void] {
  const [held, setHeld] = useState<HeldCart[]>([]);
  useEffect(() => {
    try {
      setHeld(readHeld(window.localStorage.getItem(HELD_KEY)));
    } catch {
      // Trình duyệt chặn lưu trữ: đơn giữ chỉ sống trong trang này.
    }
  }, []);
  const save = useCallback((next: HeldCart[]) => {
    setHeld(next);
    try {
      window.localStorage.setItem(HELD_KEY, JSON.stringify(next));
    } catch {
      // như trên
    }
  }, []);
  return [held, save];
}

/**
 * Quầy bán: lưới sản phẩm (quét mã vạch, lọc theo nhóm) bên trái, giỏ hàng bên phải (khách, mã giảm
 * giá, tiền khách đưa và tiền thối). Tổng là tạm tính: máy chủ tính lại giá, khuyến mại, thuế khi tạo
 * đơn. Phím tắt: F2 tìm hàng, F4 tìm khách, F9 thanh toán.
 */
export function PosTerminal({ stores }: { stores: PosStore[] }) {
  const t = useTranslations("orders.pos");
  const locale = useLocale();
  const why = useReason();
  const money = (n: number) => formatMoney(n, "VND", locale);
  const [state, run, pending] = useActionState<FormState, FormData>(posSaleAction, {});
  const [reference] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const store = stores.find((s) => s.id === storeId);
  const items = store?.items ?? [];
  const [cart, setCart] = useState<PosCart>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [hideOut, setHideOut] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [codeText, setCodeText] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string; meta?: string } | null>(
    null,
  );
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [given, setGiven] = useState("");
  const [held, saveHeld] = useStored();
  const [heldOpen, setHeldOpen] = useState(false);
  const [full, setFull] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchId = useId();

  // ------------------------------------------------------------ Sản phẩm
  const cats = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; count: number }>();
    for (const i of items) {
      if (!i.category) continue;
      const c = seen.get(i.category.id) ?? { ...i.category, count: 0 };
      c.count += 1;
      seen.set(i.category.id, c);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [items, locale]);
  const shown = items
    .filter((i) => cat === "all" || i.category?.id === cat)
    .filter((i) => matchItem(i, q))
    .filter((i) => !hideOut || i.available > 0)
    .sort((a, b) => Number(b.available > 0) - Number(a.available > 0));

  const add = (item: PosItem) => {
    const n = (cart[item.sku] ?? 0) + 1;
    if (n > item.available) {
      setScanNote(t("noMoreStock", { name: item.name, stock: item.available }));
      return;
    }
    setScanNote("");
    setCart(setQuantity(cart, item.sku, n, item.available));
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const hit = findByScan(items, q) ?? (shown.length === 1 ? shown[0] : null);
    if (!hit) {
      setScanNote(q.trim() ? t("notFound", { code: q.trim() }) : "");
      return;
    }
    add(hit);
    setQ("");
  };

  // ------------------------------------------------------------ Giỏ và tạm tính
  const lines = Object.entries(cart)
    .map(([sku, n]) => ({ item: items.find((i) => i.sku === sku), n }))
    .filter((l): l is { item: PosItem; n: number } => !!l.item);
  const totals = cartTotals(cart, items);

  const [quote, setQuote] = useState<PosQuote | null>(null);
  const [, startQuote] = useTransition();
  const quoteSeq = useRef(0);
  useEffect(() => {
    const seq = ++quoteSeq.current;
    const entries = Object.entries(cart);
    if (entries.length === 0) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(() => {
      startQuote(async () => {
        const out = await posQuoteAction({ org_id: storeId, lines: entries, codes });
        if (seq === quoteSeq.current) setQuote(out);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [cart, codes, storeId]);

  const discount = Math.min(quote?.discount ?? 0, totals.subtotal);
  const total = totals.subtotal - discount;
  const vat = totals.subtotal > 0 ? Math.round((totals.vat * total) / totals.subtotal) : 0;
  const rejected = new Set(quote?.rejected.map((r) => r.code) ?? []);
  const goodCodes = codes.filter((c) => !rejected.has(c));

  const applyCode = () => {
    const code = codeText.trim().toUpperCase();
    if (!code) return;
    if (!codes.includes(code) && codes.length < MAX_CODES) setCodes([...codes, code]);
    setCodeText("");
  };

  // ------------------------------------------------------------ Khách
  const [customerQ, setCustomerQ] = useState("");
  const [found, setFound] = useState<PosCustomer[]>([]);
  const [, startFind] = useTransition();
  useEffect(() => {
    const text = customerQ.trim();
    if (text.length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      startFind(async () => setFound(await posCustomersAction(text)));
    }, 250);
    return () => clearTimeout(timer);
  }, [customerQ]);

  // ------------------------------------------------------------ Tiền khách đưa
  const cash = method === "cash" ? parseCash(given) : null;
  const short = cash !== null && cash < total;
  const canPay = !!store?.shift && lines.length > 0 && !pending && !short;

  // ------------------------------------------------------------ Đơn giữ
  const reset = () => {
    setCart({});
    setCodes([]);
    setCodeText("");
    setCustomer(null);
    setCustomerQ("");
    setGiven("");
    setScanNote("");
  };
  const hold = () => {
    if (lines.length === 0) return;
    saveHeld([
      ...held,
      {
        id: `${Date.now()}`,
        store: storeId,
        cart,
        codes,
        customer: customer ? { id: customer.id, name: customer.name } : null,
        at: new Date().toISOString(),
      },
    ]);
    reset();
  };
  const resume = (h: HeldCart) => {
    const target = stores.find((s) => s.id === h.store);
    if (!target) return;
    const rest = held.filter((x) => x.id !== h.id);
    const mine: HeldCart[] =
      lines.length > 0
        ? [
            {
              id: `${Date.now()}`,
              store: storeId,
              cart,
              codes,
              customer: customer ? { id: customer.id, name: customer.name } : null,
              at: new Date().toISOString(),
            },
          ]
        : [];
    saveHeld([...rest, ...mine]);
    setStoreId(h.store);
    setCart(fitCart(h.cart, target.items));
    setCodes(h.codes);
    setCustomer(h.customer);
    setGiven("");
    setHeldOpen(false);
  };

  // ------------------------------------------------------------ Toàn màn hình, phím tắt
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const payRef = useRef(() => {});
  payRef.current = () => {
    if (canPay) formRef.current?.requestSubmit();
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        customerRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        payRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(iso));

  return (
    <div className={full ? "pos is-full" : "pos"} ref={rootRef}>
      <div className="pos-bar">
        <label className="pos-store">
          <span className="lab">{t("store")}</span>
          <select
            className="inp"
            name="store_pick"
            value={storeId}
            onChange={(e) => {
              const next = stores.find((s) => s.id === e.target.value);
              setStoreId(e.target.value);
              setCart(next ? fitCart(cart, next.items) : {});
              setScanNote("");
            }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {store?.shift ? (
          <span className="badge b-ok">
            <span className="dot" />
            {t("shiftOpen", {
              register: store.shift.register,
              cashier: store.shift.cashier,
              since: time(store.shift.since),
            })}
          </span>
        ) : (
          <span className="pos-noshift" role="alert">
            <span className="badge b-warn">
              <span className="dot" />
              {t("noShift")}
            </span>
            <a className="btn sm" href="/sales/stores/shifts">
              {t("openShift")}
            </a>
          </span>
        )}
        <span className="pos-bar-gap" />
        <button
          type="button"
          className="btn sm"
          aria-expanded={heldOpen}
          aria-controls="pos-held"
          onClick={() => setHeldOpen(!heldOpen)}
        >
          {t("held")}
          <span className="cnt">{held.length}</span>
        </button>
        <button type="button" className="btn sm" aria-pressed={full} onClick={toggleFull}>
          {full ? t("exitFull") : t("full")}
        </button>
      </div>

      {heldOpen ? (
        <div className="pos-held" id="pos-held">
          {held.length === 0 ? (
            <p className="fhint">{t("noHeld")}</p>
          ) : (
            <ul>
              {held.map((h) => {
                const where = stores.find((s) => s.id === h.store);
                const sum = cartTotals(h.cart, where?.items ?? []);
                return (
                  <li key={h.id}>
                    <button type="button" className="chip" onClick={() => resume(h)}>
                      <b>{h.customer?.name ?? t("heldAt", { time: time(h.at) })}</b>
                      <span className="sub num">
                        {t("heldMeta", {
                          store: where?.name ?? "—",
                          count: sum.count,
                          total: money(sum.subtotal),
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      aria-label={t("dropHeld", { time: time(h.at) })}
                      onClick={() => saveHeld(held.filter((x) => x.id !== h.id))}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <div className="pos-main">
        <section className="pos-goods" aria-labelledby={`${searchId}-h`}>
          <h2 id={`${searchId}-h`} className="vh">
            {t("items")}
          </h2>
          <div className="pos-find">
            <div className="pos-search">
              <label className="vh" htmlFor={searchId}>
                {t("search")}
              </label>
              <input
                id={searchId}
                ref={searchRef}
                className="inp"
                type="search"
                autoComplete="off"
                placeholder={t("searchHint")}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setScanNote("");
                }}
                onKeyDown={onSearchKey}
              />
              <span className="kbd" aria-hidden="true">
                F2
              </span>
            </div>
            <label className="pos-toggle">
              <input
                className="pos-check"
                type="checkbox"
                checked={hideOut}
                onChange={(e) => setHideOut(e.target.checked)}
              />
              {t("hideOut")}
            </label>
          </div>
          {scanNote ? (
            <p className="ferr" role="status">
              {scanNote}
            </p>
          ) : null}
          {cats.length > 1 ? (
            <fieldset className="chips pos-cats">
              <legend className="vh">{t("categories")}</legend>
              <button
                type="button"
                className={cat === "all" ? "chip on" : "chip"}
                aria-pressed={cat === "all"}
                onClick={() => setCat("all")}
              >
                {t("allCategories")}
                <span className="cnt">{items.length}</span>
              </button>
              {cats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cat === c.id ? "chip on" : "chip"}
                  aria-pressed={cat === c.id}
                  onClick={() => setCat(c.id)}
                >
                  {c.name}
                  <span className="cnt">{c.count}</span>
                </button>
              ))}
            </fieldset>
          ) : null}
          {shown.length === 0 ? (
            <p className="pos-empty">{t("noMatch")}</p>
          ) : (
            <ul className="pos-tiles">
              {shown.map((i) => {
                const n = cart[i.sku] ?? 0;
                const out = i.available === 0;
                return (
                  <li key={i.sku}>
                    <button
                      type="button"
                      className={n > 0 ? "pos-tile in" : "pos-tile"}
                      disabled={out}
                      aria-label={t("addItem", {
                        name: i.name,
                        price: money(i.price),
                        stock: i.available,
                      })}
                      onClick={() => add(i)}
                    >
                      <span
                        className={`pos-thumb t${tone(i.category?.id ?? i.sku)}`}
                        aria-hidden="true"
                      >
                        {initials(i.name)}
                      </span>
                      {n > 0 ? (
                        <span className="pos-qtyb" aria-hidden="true">
                          {n}
                        </span>
                      ) : null}
                      <span className="pos-name">{i.name}</span>
                      <span className="pos-tile-foot">
                        <b className="num">{money(i.price)}</b>
                        <span
                          className={
                            out ? "pos-stock out" : i.available <= 3 ? "pos-stock low" : "pos-stock"
                          }
                        >
                          {out ? t("outOfStock") : t("stock", { stock: i.available })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="fhint">{t("goodsHint")}</p>
        </section>

        <form
          ref={formRef}
          action={run}
          className="pos-cart"
          aria-labelledby={`${searchId}-cart`}
          noValidate
        >
          <input type="hidden" name="org_id" value={storeId} />
          <input
            type="hidden"
            name="lines"
            value={lines.map((l) => `${l.item.sku} x ${l.n}`).join(", ")}
          />
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="codes" value={goodCodes.join(" ")} />
          <input type="hidden" name="customer_id" value={customer?.id ?? ""} />

          <div className="pos-cart-head">
            <h2 id={`${searchId}-cart`} className="h2">
              {t("cart")}{" "}
              <span className="pos-head-count num">· {t("count", { count: totals.count })}</span>
            </h2>
            <button
              type="button"
              className="btn ghost sm danger"
              disabled={lines.length === 0 && codes.length === 0 && !customer}
              onClick={reset}
            >
              {t("clear")}
            </button>
          </div>

          <div className="pos-cart-body">
            {customer ? (
              <div className="pos-who">
                <span className="pos-av" aria-hidden="true">
                  {initials(customer.name)}
                </span>
                <span className="cell2">
                  <b>{customer.name}</b>
                  {customer.meta ? <span className="pos-meta num">{customer.meta}</span> : null}
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={t("dropCustomer", { name: customer.name })}
                  onClick={() => setCustomer(null)}
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="pos-find-who">
                <label className="vh" htmlFor={`${searchId}-who`}>
                  {t("customer")}
                </label>
                <input
                  id={`${searchId}-who`}
                  ref={customerRef}
                  className="inp"
                  type="search"
                  autoComplete="off"
                  placeholder={t("customerHint")}
                  value={customerQ}
                  onChange={(e) => setCustomerQ(e.target.value)}
                />
                {found.length > 0 ? (
                  <ul className="pos-who-list" aria-label={t("customerResults")}>
                    {found.map((c) => {
                      const meta = t("customerMeta", {
                        phone: c.phone ?? "—",
                        tier: t(`tiers.${c.tier}`),
                        points: c.points,
                      });
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomer({ id: c.id, name: c.name, meta });
                              setCustomerQ("");
                              setFound([]);
                            }}
                          >
                            <b>{c.name}</b>
                            <span className="pos-meta num">{meta}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            )}

            {lines.length === 0 ? (
              <p className="pos-empty">{t("emptyCart")}</p>
            ) : (
              <ul className="pos-lines">
                {lines.map(({ item, n }) => (
                  <li key={item.sku}>
                    <span className="cell2">
                      <span className="pos-line-name">{item.name}</span>
                      <span className="sub num">
                        {t("lineMeta", { price: money(item.price), vat: item.vat })}
                      </span>
                    </span>
                    <b className="num pos-line-total">{money(item.price * n)}</b>
                    <span className="pos-step">
                      <button
                        type="button"
                        aria-label={t("less", { name: item.name })}
                        onClick={() => setCart(setQuantity(cart, item.sku, n - 1, item.available))}
                      >
                        −
                      </button>
                      <output aria-label={t("qty", { name: item.name })}>{n}</output>
                      <button
                        type="button"
                        aria-label={t("more", { name: item.name })}
                        disabled={n >= item.available}
                        onClick={() => setCart(setQuantity(cart, item.sku, n + 1, item.available))}
                      >
                        +
                      </button>
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      aria-label={t("remove", { name: item.name })}
                      onClick={() => setCart(setQuantity(cart, item.sku, 0, item.available))}
                    >
                      {t("removeShort")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {state.fields?.lines ? <p className="ferr">{state.fields.lines}</p> : null}

            <div className="pos-code">
              <label className="vh" htmlFor={`${searchId}-code`}>
                {t("code")}
              </label>
              <input
                id={`${searchId}-code`}
                className="inp mono"
                autoComplete="off"
                placeholder={t("code")}
                value={codeText}
                onChange={(e) => setCodeText(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCode();
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={!codeText.trim() || codes.length >= MAX_CODES}
                onClick={applyCode}
              >
                {t("applyCode")}
              </button>
            </div>
            {codes.length > 0 ? (
              <ul className="pos-codes">
                {codes.map((c) => {
                  const bad = quote?.rejected.find((r) => r.code === c);
                  return (
                    <li key={c} className={bad ? "bad" : ""}>
                      <span className="mono">{c}</span>
                      {bad ? <span className="sub">{why(bad.reason)}</span> : null}
                      <button
                        type="button"
                        className="btn ghost sm"
                        aria-label={t("dropCode", { code: c })}
                        onClick={() => setCodes(codes.filter((x) => x !== c))}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {quote && (quote.applied.length > 0 || quote.gifts.length > 0) ? (
              <ul className="pos-promos" aria-live="polite">
                {quote.applied
                  .filter((a) => a.amount > 0)
                  .map((a) => (
                    <li key={a.id}>
                      <span>
                        {a.title}
                        {a.code ? ` (${a.code})` : ""}
                      </span>
                      <b className="num">−{money(a.amount)}</b>
                    </li>
                  ))}
                {quote.gifts.map((g) => (
                  <li key={g.name}>
                    <span>{t("gift", { name: g.name, count: g.quantity })}</span>
                    <b>{t("free")}</b>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="pos-cart-foot">
            <dl className="ord-sums">
              <dt>{t("subtotal")}</dt>
              <dd>{money(totals.subtotal)}</dd>
              <dt>{t("discount")}</dt>
              <dd className={discount > 0 ? "pos-disc" : ""}>
                {discount > 0 ? `−${money(discount)}` : money(0)}
              </dd>
              <dt>{t("vatIncludedLabel")}</dt>
              <dd>{money(vat)}</dd>
            </dl>
            <div className="pos-total">
              <span className="h2">{t("total")}</span>
              <b className="num" data-testid="pos-total">
                {money(total)}
              </b>
            </div>
            <fieldset className="pos-methods">
              <legend className="vh">{t("method")}</legend>
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={method === m ? "on" : ""}
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                >
                  {t(`methods.${m}`)}
                </button>
              ))}
            </fieldset>
            {method === "cash" ? (
              <div className="pos-cash">
                <label className="pos-given">
                  <span>{t("given")}</span>
                  <input
                    className="inp num"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={given}
                    aria-invalid={short || undefined}
                    onChange={(e) => {
                      const n = parseCash(e.target.value);
                      setGiven(
                        n === null
                          ? e.target.value.replace(/[^\d]/g, "")
                          : n.toLocaleString(locale),
                      );
                    }}
                  />
                </label>
                {total > 0 ? (
                  <fieldset className="pos-quick">
                    <legend className="vh">{t("quickCash")}</legend>
                    {cashSuggestions(total).map((v, i) => (
                      <button
                        key={v}
                        type="button"
                        className="chip"
                        onClick={() => setGiven(v.toLocaleString(locale))}
                      >
                        {i === 0 ? t("exact") : money(v)}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
                <div className="pos-change">
                  <span>{t("change")}</span>
                  <b className={short ? "num pos-short" : "num"} aria-live="polite">
                    {cash === null
                      ? "—"
                      : short
                        ? t("short", { amount: money(total - cash) })
                        : money(cash - total)}
                  </b>
                </div>
              </div>
            ) : null}
            <FormAlert state={state} />
            <div className="pos-acts">
              <button
                type="button"
                className="btn pos-act"
                disabled={lines.length === 0}
                onClick={hold}
              >
                {t("hold")}
              </button>
              <button type="submit" className="btn pri pos-act pos-pay" disabled={!canPay}>
                <span>
                  {t("submit")}{" "}
                  <span className="kbd" aria-hidden="true">
                    F9
                  </span>
                </span>
                <span className="num">{money(total)}</span>
              </button>
            </div>
            <p className="fhint">{t("estimate")}</p>
          </div>
        </form>
      </div>
    </div>
  );
}
