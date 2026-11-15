"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { createApiKey, type SecretState } from "@/app/(admin)/settings/actions";
import { PermissionPicker } from "@/components/access/permission-picker";
import { Field, FormAlert, SelectField, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { CopyButton, SecretOnce } from "@/components/ui/secret-once";
import { EXPIRY_CHOICES } from "@/lib/api-keys";
import type { PermissionInfo } from "@/lib/permission-groups";

/**
 * Tạo API key: tên, hạn, permission (chỉ những gì người tạo đang có), mật khẩu hiện tại. Xong thì
 * hiện khoá một lần, kèm lệnh `curl` mẫu để thử ngay. Ô chọn giữ trong state, form gửi qua
 * `onSubmit`, để core báo lỗi thì lựa chọn không mất.
 */
export function ApiKeyCreator({
  catalog,
  coreUrl,
}: {
  catalog: readonly PermissionInfo[];
  coreUrl: string;
}) {
  const t = useTranslations("settings.apiKeys");
  const form = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [state, submit, pending] = useSubmit<SecretState>(createApiKey, () => {});
  useFocusInvalid(form, state);

  if (state.secret) {
    const example = `curl -s ${coreUrl}/api/v1/auth/me -H 'Authorization: Bearer ${state.secret}'`;
    return (
      <div className="card padded blocks" data-testid="created-key">
        <SecretOnce value={state.secret} label={t("key")} note={t("keyOnce")} />
        <div className="fld">
          <span className="lab">{t("tryIt")}</span>
          <code className="secret mono">{example}</code>
          <CopyButton text={example} label={t("copyCommand")} />
        </div>
        <div className="dlg-acts">
          <Link className="btn pri" href="/settings/api-keys">
            {t("stored")}
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="role-form">
      <div className="card role-meta">
        <Field
          label={t("name")}
          name="name"
          autoComplete="off"
          mono
          defaultValue={state.values?.name}
          hint={t("nameHint")}
          error={state.fields?.name}
          autoFocus
        />
        <SelectField
          label={t("expiry")}
          name="expiry"
          defaultValue={state.values?.expiry || "90d"}
          options={EXPIRY_CHOICES.map((choice) => ({
            value: choice,
            label: t(`expiries.${choice}`),
          }))}
          hint={t("expiryHint")}
        />
      </div>
      <PermissionPicker
        catalog={catalog}
        chosen={chosen}
        onChange={setChosen}
        editable
        error={state.fields?.permissions}
      />
      <div className="card role-meta">
        <Field
          label={t("password")}
          name="current_password"
          type="password"
          autoComplete="current-password"
          hint={t("passwordHint")}
          error={state.fields?.current_password}
        />
      </div>
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("create")}
        </button>
      </div>
    </form>
  );
}
