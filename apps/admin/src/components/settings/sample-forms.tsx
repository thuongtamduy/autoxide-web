"use client";

// Biểu mẫu của các tab Cài đặt dùng dữ liệu mẫu (W-006): đổi gói, hồ sơ xuất hoá đơn, đặt kết
// nối đối tác. Cùng cách làm với phần gọi core thật: Server Action, lỗi theo ô, gom
// mọi lỗi một lần; chỉ khác là action gọi hàm mẫu thay cho API chưa có.
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { saveConnectionAction } from "@/app/(admin)/settings/sample-actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface Option {
  value: string;
  label: string;
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
