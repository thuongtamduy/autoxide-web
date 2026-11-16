"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { text } from "@/sample";
import type { SavedAddress } from "@/sample/account";
import { PROVINCES, provinceByCode, wardByCode } from "@/sample/address";
import { type FieldError, normalizePhone, PHONE } from "@/sample/checkout";
import { Icon } from "../icon";
import { ErrorText, errorFor } from "./form-errors";

/**
 * Sổ địa chỉ: địa chỉ đã lưu (hai cấp tỉnh → phường, xã), đặt mặc định, xoá, thêm mới. Mẫu: chỉ đổi
 * trên trang này; thay bằng `GET/POST/PATCH/DELETE /api/v1/shipping/me/addresses` (bước 44).
 */
export function AddressBook({
  initial,
  locale,
}: {
  initial: readonly SavedAddress[];
  locale: string;
}) {
  const t = useTranslations("account.addresses");
  const [list, setList] = useState<SavedAddress[]>(() => [...initial]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    name: "",
    phone: "",
    province: "",
    ward: "",
    street: "",
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const province = provinceByCode(draft.province);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const found: FieldError[] = [];
    if (!draft.name.trim()) found.push({ field: "name", code: "name_required" });
    if (!PHONE.test(normalizePhone(draft.phone)))
      found.push({ field: "phone", code: "phone_invalid" });
    if (!draft.province) found.push({ field: "province", code: "province_required" });
    if (!draft.ward) found.push({ field: "ward", code: "ward_required" });
    if (!draft.street.trim()) found.push({ field: "street", code: "street_required" });
    setErrors(found);
    if (found.length > 0) return;
    const label = draft.label.trim() || t("defaultLabel");
    setList((items) => [
      ...items,
      {
        id: `n${items.length + 1}`,
        label: { vi: label, en: label },
        name: draft.name.trim(),
        phone: normalizePhone(draft.phone),
        street: draft.street.trim(),
        province: draft.province,
        ward: draft.ward,
        default: items.length === 0,
      },
    ]);
    setDraft({ label: "", name: "", phone: "", province: "", ward: "", street: "" });
    setAdding(false);
  };

  const input = (key: keyof typeof draft) => ({
    id: `ad-${key}`,
    value: draft[key],
    "aria-invalid": errorFor(errors, key) ? true : undefined,
    "aria-describedby": `ad-${key}-err`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setDraft((d) => ({ ...d, [key]: value, ...(key === "province" ? { ward: "" } : {}) }));
      setErrors((list) => list.filter((x) => x.field !== key));
    },
  });

  return (
    <>
      <div className="acx-addr">
        {list.map((a) => (
          <div className="card acx-addr-card" key={a.id}>
            <span className="acx-addr-head">
              <b>{text(a.label, locale)}</b>
              {a.default ? <span className="badge b-brand">{t("default")}</span> : null}
            </span>
            <span>
              {a.name} · <span className="num">{a.phone}</span>
            </span>
            <span className="muted">
              {[
                a.street,
                text(wardByCode(a.province, a.ward)?.name ?? { vi: "", en: "" }, locale),
                text(provinceByCode(a.province)?.name ?? { vi: "", en: "" }, locale),
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
            <span className="acx-ret-btns">
              {a.default ? null : (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    setList((items) => items.map((x) => ({ ...x, default: x.id === a.id })))
                  }
                >
                  {t("makeDefault")}
                </button>
              )}
              <button
                type="button"
                className="btn sm ghost"
                aria-label={t("removeNamed", { label: text(a.label, locale) })}
                onClick={() => setList((items) => items.filter((x) => x.id !== a.id))}
              >
                <Icon name="trash" small />
                {t("remove")}
              </button>
            </span>
          </div>
        ))}
        {adding ? null : (
          <button type="button" className="card acx-addr-add" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            {t("add")}
          </button>
        )}
      </div>
      {adding ? (
        <form className="card acx-card pop" onSubmit={save} noValidate aria-labelledby="ad-title">
          <h3 className="dsp" id="ad-title">
            {t("addTitle")}
          </h3>
          <div className="co-fields">
            <div className="co-field">
              <label className="lab" htmlFor="ad-label">
                {t("label")}
              </label>
              <input className="inp" placeholder={t("labelHint")} {...input("label")} />
            </div>
            <div className="co-field">
              <label className="lab" htmlFor="ad-name">
                {t("name")}
              </label>
              <input className="inp" autoComplete="name" {...input("name")} />
              <ErrorText id="ad-name-err" error={errorFor(errors, "name")} />
            </div>
            <div className="co-field">
              <label className="lab" htmlFor="ad-phone">
                {t("phone")}
              </label>
              <input
                className="inp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                {...input("phone")}
              />
              <ErrorText id="ad-phone-err" error={errorFor(errors, "phone")} />
            </div>
            <div className="co-field">
              <label className="lab" htmlFor="ad-province">
                {t("province")}
              </label>
              <select className="sel" {...input("province")}>
                <option value="">{t("provinceChoose")}</option>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {text(p.name, locale)}
                  </option>
                ))}
              </select>
              <ErrorText id="ad-province-err" error={errorFor(errors, "province")} />
            </div>
            <div className="co-field">
              <label className="lab" htmlFor="ad-ward">
                {t("ward")}
              </label>
              <select className="sel" disabled={!province} {...input("ward")}>
                <option value="">{t("wardChoose")}</option>
                {province?.wards.map((w) => (
                  <option key={w.code} value={w.code}>
                    {text(w.name, locale)}
                  </option>
                ))}
              </select>
              <ErrorText id="ad-ward-err" error={errorFor(errors, "ward")} />
            </div>
            <div className="co-field">
              <label className="lab" htmlFor="ad-street">
                {t("street")}
              </label>
              <input className="inp" autoComplete="street-address" {...input("street")} />
              <ErrorText id="ad-street-err" error={errorFor(errors, "street")} />
            </div>
          </div>
          <span className="acx-ret-btns">
            <button type="submit" className="btn pri sm">
              {t("save")}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>
              {t("cancel")}
            </button>
          </span>
        </form>
      ) : null}
      <p className="help">{t("note")}</p>
    </>
  );
}
