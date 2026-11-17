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
  /** Nhãn đã dịch; tên kỹ thuật chỉ hiện nhỏ dưới ô. */
  label: string;
  hint?: string | undefined;
}

/**
 * Đặt hay đổi cài đặt của một kết nối mẫu (nhà cung cấp core chưa nhận). Ô secret không bao giờ hiện giá trị cũ: để trống thì giữ
 * giá trị đang dùng, nhập mới thì thay.
 */
export function ConnectionDialog({
  id,
  title,
  label,
  ariaLabel,
  about,
  primary = false,
  fields,
}: {
  id: string;
  title: string;
  label: string;
  ariaLabel: string;
  about: string;
  primary?: boolean;
  fields: readonly ConnectionField[];
}) {
  return (
    <Dialog
      label={label}
      ariaLabel={ariaLabel}
      title={title}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      intro={<p>{about}</p>}
    >
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
      {fields.map((field) => {
        const secretHint = field.secret ? (field.is_set ? t("secretKeep") : t("secretNew")) : "";
        const hint = [field.hint, secretHint].filter(Boolean).join(" ");
        return (
          <div className="conn-field" key={field.name}>
            <Field
              label={field.label}
              name={field.name}
              mono
              autoComplete="off"
              type={field.secret ? "password" : "text"}
              defaultValue={field.secret ? "" : (state.values?.[field.name] ?? field.value ?? "")}
              hint={hint || undefined}
              error={state.fields?.[field.name]}
            />
            <code className="conn-key mono">{field.name}</code>
          </div>
        );
      })}
      <FormAlert state={state} />
      <DialogButtons submit={t("save")} pending={pending} close={close} />
    </form>
  );
}
