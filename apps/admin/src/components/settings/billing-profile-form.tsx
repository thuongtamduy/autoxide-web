"use client";

import { useTranslations } from "next-intl";
import { Fragment, useActionState, useRef, useState, useTransition } from "react";
import { communesOf } from "@/app/(admin)/org/access/profile-actions";
import { saveBillingProfile } from "@/app/(admin)/settings/plan-actions";
import { Field, FormAlert, SelectField, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface Option {
  value: string;
  label: string;
}

export interface BillingValues {
  legal_name: string;
  tax_code: string;
  email: string;
  phone: string;
  province_code: string;
  commune_code: string;
  line: string;
}

/**
 * Hồ sơ xuất hoá đơn của khách (`PUT /plans/billing-profile`, D-335 của core): bên mua trên hoá đơn
 * của nền tảng. Địa chỉ theo danh mục hành chính của core: chọn tỉnh thì tải phường, xã của tỉnh đó.
 */
export function BillingProfileForm({
  profile,
  provinces,
  communes: initialCommunes,
  editable,
}: {
  profile: BillingValues;
  provinces: Option[];
  /** Phường, xã của tỉnh trong hồ sơ (trống khi chưa có địa chỉ). */
  communes: Option[];
  editable: boolean;
}) {
  const t = useTranslations("settings.plan.profile");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveBillingProfile, {});
  const [province, setProvince] = useState(profile.province_code);
  const [communes, setCommunes] = useState(initialCommunes);
  const [loading, startLoading] = useTransition();
  // React đặt lại form sau mỗi lần gửi; ô chọn không theo `defaultValue` mới: dựng lại các ô (`round`)
  // với giá trị vừa gửi.
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setRound((n) => n + 1);
    if (state.values?.province_code !== undefined) setProvince(state.values.province_code);
  }
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("saved")));
  const value = (name: keyof BillingValues) => state.values?.[name] ?? profile[name];
  return (
    <form ref={form} action={action} noValidate className="card padded dlg-form">
      <Fragment key={round}>
        <Field
          label={t("legalName")}
          name="legal_name"
          defaultValue={value("legal_name")}
          error={state.fields?.legal_name}
          disabled={!editable}
        />
        <div className="fld-row">
          <Field
            label={t("taxCode")}
            name="tax_code"
            mono
            defaultValue={value("tax_code")}
            hint={t("taxCodeHint")}
            error={state.fields?.tax_code}
            disabled={!editable}
          />
          <Field
            label={t("phone")}
            name="phone"
            type="tel"
            defaultValue={value("phone")}
            error={state.fields?.phone}
            disabled={!editable}
          />
        </div>
        <Field
          label={t("email")}
          name="email"
          type="email"
          defaultValue={value("email")}
          error={state.fields?.email}
          disabled={!editable}
        />
        <div className="fld-row">
          <SelectField
            label={t("province")}
            name="province_code"
            options={[{ value: "", label: t("choose") }, ...provinces]}
            defaultValue={value("province_code")}
            onChange={(event) => {
              const code = event.target.value;
              setProvince(code);
              setCommunes([]);
              if (code) startLoading(async () => setCommunes(await communesOf(code)));
            }}
            error={state.fields?.province_code}
            disabled={!editable}
          />
          <SelectField
            key={`${province}|${communes.length}`}
            label={t("commune")}
            name="commune_code"
            options={[{ value: "", label: loading ? t("loading") : t("choose") }, ...communes]}
            defaultValue={value("commune_code")}
            disabled={!editable || !province || loading}
            error={state.fields?.commune_code}
            hint={t("communeHint")}
          />
        </div>
        <Field
          label={t("line")}
          name="line"
          defaultValue={value("line")}
          error={state.fields?.line}
          disabled={!editable}
        />
      </Fragment>
      {editable ? (
        <div className="role-foot">
          <FormAlert state={state} />
          <button type="submit" className="btn pri" disabled={pending}>
            {t("save")}
          </button>
        </div>
      ) : null}
    </form>
  );
}
