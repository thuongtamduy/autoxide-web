"use client";

// Biểu mẫu của các tab Cài đặt dùng dữ liệu mẫu (W-006): đổi gói, hồ sơ xuất hoá đơn, đặt kết
// nối đối tác. Cùng cách làm với phần gọi core thật: Server Action, lỗi theo ô, gom
// mọi lỗi một lần; chỉ khác là action gọi hàm mẫu thay cho API chưa có.
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { saveBillingProfile, saveConnectionAction } from "@/app/(admin)/settings/sample-actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  useFocusInvalid,
  useOnDone,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface Option {
  value: string;
  label: string;
}

export interface ProfileValues {
  legal_name: string;
  tax_code: string;
  email: string;
  phone: string;
  address_province_code: string;
  address_commune: string;
  address_line: string;
}

/** Hồ sơ xuất hoá đơn: đơn vị, mã số thuế, email nhận hoá đơn, điện thoại, địa chỉ. */
export function BillingProfileForm({
  profile,
  provinces,
  editable,
}: {
  profile: ProfileValues;
  provinces: Option[];
  editable: boolean;
}) {
  const t = useTranslations("settings.plan.profile");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveBillingProfile, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("saved")));
  const value = (name: keyof ProfileValues) => state.values?.[name] ?? profile[name];
  return (
    <form ref={form} action={action} noValidate className="card padded dlg-form">
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
          name="address_province_code"
          options={provinces}
          defaultValue={value("address_province_code")}
          disabled={!editable}
        />
        <Field
          label={t("commune")}
          name="address_commune"
          defaultValue={value("address_commune")}
          hint={t("communeHint")}
          disabled={!editable}
        />
      </div>
      <Field
        label={t("line")}
        name="address_line"
        defaultValue={value("address_line")}
        disabled={!editable}
      />
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

export interface ConnectionField {
  name: string;
  secret: boolean;
  is_set: boolean;
  value: string | null;
}

/**
 * Đặt hay đổi cài đặt của một kết nối. Ô secret không bao giờ hiện giá trị cũ: để trống thì giữ
 * giá trị đang dùng, nhập mới thì thay.
 */
export function ConnectionDialog({
  id,
  title,
  label,
  fields,
}: {
  id: string;
  title: string;
  label: string;
  fields: readonly ConnectionField[];
}) {
  const t = useTranslations("settings.connections");
  return (
    <Dialog label={label} title={title} intro={t("formIntro")}>
      {(close) => <ConnectionForm id={id} fields={fields} close={close} />}
    </Dialog>
  );
}

function ConnectionForm({
  id,
  fields,
  close,
}: {
  id: string;
  fields: readonly ConnectionField[];
  close: () => void;
}) {
  const t = useTranslations("settings.connections");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveConnectionAction, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("saved"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <input type="hidden" name="id" value={id} />
      {fields.map((field) => (
        <Field
          key={field.name}
          label={field.name}
          name={field.name}
          mono
          autoComplete="off"
          type={field.secret ? "password" : "text"}
          defaultValue={field.secret ? "" : (state.values?.[field.name] ?? field.value ?? "")}
          hint={field.secret ? (field.is_set ? t("secretKeep") : t("secretNew")) : undefined}
          error={state.fields?.[field.name]}
        />
      ))}
      <FormAlert state={state} />
      <DialogButtons submit={t("save")} pending={pending} close={close} />
    </form>
  );
}
