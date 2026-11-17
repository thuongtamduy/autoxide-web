"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { updateProfile } from "@/app/(admin)/account/actions";
import { Field, FormAlert, SelectField, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/**
 * Hồ sơ của chính mình (`PATCH /auth/me`): tên hiển thị, ngôn ngữ và múi giờ ưa thích. Ngôn ngữ ưa
 * thích là ngôn ngữ của thư core gửi sau này; ngôn ngữ giao diện vẫn đổi bằng nút EN / VI.
 */
export function ProfileForm({
  name,
  locale,
  timeZone,
  zones,
}: {
  name: string;
  locale: string;
  timeZone: string;
  /** Gợi ý múi giờ (IANA) cho ô nhập; core kiểm giá trị. */
  zones: readonly string[];
}) {
  const t = useTranslations("account.profile");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(updateProfile, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("saved")));
  const value = (key: "name" | "locale" | "time_zone", fallback: string) =>
    state.values?.[key] ?? fallback;
  return (
    <form ref={form} action={action} noValidate className="card dlg-form padded">
      <Field
        label={t("name")}
        name="name"
        autoComplete="name"
        defaultValue={value("name", name)}
        error={state.fields?.name}
      />
      <SelectField
        // React đặt lại form sau mỗi lần gửi; `key` dựng lại ô chọn với giá trị vừa gửi.
        key={`locale-${value("locale", locale)}`}
        label={t("locale")}
        name="locale"
        hint={t("localeHint")}
        options={[
          { value: "", label: t("localeNone") },
          { value: "vi", label: "Tiếng Việt" },
          { value: "en", label: "English" },
        ]}
        defaultValue={value("locale", locale)}
        error={state.fields?.locale}
      />
      <Field
        label={t("timeZone")}
        name="time_zone"
        list="time-zones"
        autoComplete="off"
        mono
        hint={t("timeZoneHint")}
        defaultValue={value("time_zone", timeZone)}
        error={state.fields?.time_zone}
      />
      <datalist id="time-zones">
        {zones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button type="submit" className="btn pri" disabled={pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
