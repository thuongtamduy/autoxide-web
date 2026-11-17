"use client";

// Hộp thoại cài đặt một kết nối đối tác (hay một cài đặt nghiệp vụ) của core: mọi ô của kết nối
// trong một form, một nút Lưu. Server Action giữ nguyên như cũ — `setTenantSetting` /
// `removeTenantSetting`, mỗi lệnh một cài đặt (`PUT` / `DELETE /kernel/settings/{name}`) — nên
// form gọi lần lượt từng lệnh cho các ô đã đổi (`planChanges`). Secret không bao giờ điền lại.
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { planChanges, type SettingField } from "@/lib/tenant-settings";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Một ô của hộp thoại: cài đặt của core kèm nhãn và gợi ý đã dịch. */
export interface SettingDialogField extends SettingField {
  label: string;
  hint?: string | undefined;
}

export interface SettingDialogProps {
  /** Tên hiện cho người dùng (vd "Máy chủ thư riêng"), dùng trong câu báo. */
  name: string;
  fields: readonly SettingDialogField[];
  /** Nút gỡ mọi giá trị đặt riêng (vd "Ngắt kết nối", "Về mặc định"). */
  removeLabel: string;
  save: Action;
  remove: Action;
}

/** Nút "Cấu hình" / "Sửa" mở hộp thoại cài đặt. */
export function SettingDialog({
  label,
  ariaLabel,
  title,
  about,
  primary = false,
  ...form
}: SettingDialogProps & {
  label: string;
  ariaLabel: string;
  title: string;
  about?: string | undefined;
  primary?: boolean;
}) {
  return (
    <Dialog
      label={label}
      ariaLabel={ariaLabel}
      title={title}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      intro={about ? <p>{about}</p> : undefined}
    >
      {(close) => <SettingForm {...form} close={close} />}
    </Dialog>
  );
}

/** Form trong hộp thoại; tách riêng để test không cần `<dialog>`. */
export function SettingForm({
  name,
  fields,
  removeLabel,
  save,
  remove,
  close,
}: SettingDialogProps & { close: () => void }) {
  const t = useTranslations("settings.connections.dialog");
  const s = useTranslations("settings.connections");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  useFocusInvalid(form, state);
  const anySet = fields.some((field) => field.is_set);

  // Lệnh cập nhật sau `await` phải nằm lại trong transition (như `useSubmit`): nếu không, React đặt
  // lại form ở lần vẽ sau và đè chữ người dùng vừa sửa.
  const fail = (next: FormState) => startTransition(() => setState(next));

  const submit = (data: FormData) =>
    startTransition(async () => {
      const changes = planChanges(fields, (field) => String(data.get(field) ?? ""));
      // Ô thường vừa gửi, để điền lại khi báo lỗi; secret không bao giờ điền lại.
      const values = Object.fromEntries(
        fields.filter((f) => !f.secret).map((f) => [f.name, String(data.get(f.name) ?? "")]),
      );
      if (changes.length === 0) {
        const first = fields[0];
        if (!anySet && first) {
          fail({ fields: { [first.name]: t("required") }, values });
          return;
        }
        close();
        return;
      }
      for (const change of changes) {
        const body = new FormData();
        if (change.op === "set") {
          body.set("name", change.name);
          body.set("secret", change.secret ? "1" : "0");
          body.set("value", change.value);
        } else {
          body.set("id", change.name);
        }
        const result = await (change.op === "set" ? save : remove)({}, body);
        if (!result.done) {
          const message = result.fields?.value;
          fail({
            ...(result.error ? { error: result.error } : {}),
            ...(result.code ? { code: result.code } : {}),
            ...(message ? { fields: { [change.name]: message } } : {}),
            values,
          });
          return;
        }
      }
      close();
      toast(t("saved", { name }));
    });

  const removeAll = () =>
    startTransition(async () => {
      for (const field of fields.filter((f) => f.is_set)) {
        const body = new FormData();
        body.set("id", field.name);
        const result = await remove({}, body);
        if (!result.done) {
          fail({
            ...(result.error ? { error: result.error } : {}),
            ...(result.code ? { code: result.code } : {}),
          });
          return;
        }
      }
      close();
      toast(t("removed", { name }));
    });

  if (confirming) {
    return (
      <div className="dlg-form" data-testid="conn-remove">
        <p className="conn-ask">{t("removeAsk", { name })}</p>
        <FormAlert state={state} />
        <div className="dlg-acts">
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            {t("back")}
          </button>
          <button type="button" className="btn danger-solid" disabled={pending} onClick={removeAll}>
            {removeLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={form} action={submit} noValidate className="dlg-form">
      {fields.map((field) => {
        const secretHint = field.secret ? (field.is_set ? s("secretKeep") : s("secretNew")) : "";
        const hint = [field.hint, secretHint].filter(Boolean).join(" ");
        return (
          <div className="conn-field" key={field.name}>
            <Field
              label={field.label}
              name={field.name}
              type={field.secret ? "password" : "text"}
              mono
              autoComplete="off"
              placeholder={field.secret ? undefined : t("serverDefault")}
              {...(field.secret
                ? {}
                : { defaultValue: state.values?.[field.name] ?? field.value ?? "" })}
              hint={hint || undefined}
              error={state.fields?.[field.name]}
            />
            <code className="conn-key mono">{field.name}</code>
          </div>
        );
      })}
      <FormAlert state={state} />
      <div className="conn-foot">
        {anySet ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              setState({});
              setConfirming(true);
            }}
          >
            {removeLabel}
          </button>
        ) : null}
        <DialogButtons submit={t("save")} pending={pending} close={close} />
      </div>
    </form>
  );
}
