"use client";

import { useTranslations } from "next-intl";
import { Fragment, useActionState, useRef, useState, useTransition } from "react";
import { communesOf, saveProfile } from "@/app/(admin)/org/access/profile-actions";
import {
  CheckField,
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
  unit_id: string;
  public: boolean;
  display_name: string;
  province_code: string;
  commune_code: string;
  line: string;
  opens: string;
  closes: string;
  pickup: boolean;
}

/**
 * Hồ sơ công khai của một nút (`PATCH /organizations/units/{id}/public-profile`). Địa chỉ theo danh
 * mục hành chính của core: chọn tỉnh thì tải danh sách phường, xã của tỉnh đó.
 */
export function ProfileForm({
  profile,
  provinces,
  communes: initialCommunes,
}: {
  profile: ProfileValues;
  provinces: Option[];
  /** Phường, xã của tỉnh đang có trong hồ sơ (trống khi chưa có địa chỉ). */
  communes: Option[];
}) {
  const t = useTranslations("access.public");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveProfile, {});
  const [province, setProvince] = useState(profile.province_code);
  const [communes, setCommunes] = useState(initialCommunes);
  const [loading, startLoading] = useTransition();
  // React đặt lại form sau mỗi lần gửi; ô chọn và ô đánh dấu không theo `defaultValue` mới. Mỗi
  // kết quả mới thì dựng lại các ô (`round`) với giá trị vừa gửi (`state.values`).
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setRound((n) => n + 1);
    if (state.values?.province_code !== undefined) setProvince(state.values.province_code);
  }
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("saved")));
  const value = (name: keyof ProfileValues) => state.values?.[name] ?? String(profile[name] ?? "");
  const checked = (name: "public" | "pickup") =>
    state.values?.[name] !== undefined ? state.values[name] === "on" : profile[name];
  return (
    <form
      ref={form}
      action={action}
      noValidate
      className="card dlg-form padded"
      key={profile.unit_id}
    >
      <input type="hidden" name="unit_id" value={profile.unit_id} />
      <Fragment key={round}>
        <CheckField
          name="public"
          label={t("isPublic")}
          hint={t("isPublicHint")}
          defaultChecked={checked("public")}
        />
        <Field
          label={t("displayName")}
          name="display_name"
          defaultValue={value("display_name")}
          error={state.fields?.display_name}
        />
        {/* Ô tỉnh không điều khiển (React đặt lại form sau mỗi lần gửi: giá trị lấy từ `state.values`);
          `province` chỉ để tải phường, xã của tỉnh đang chọn. */}
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
          hint={t("provinceHint")}
        />
        <SelectField
          key={`${province}|${communes.length}`}
          label={t("commune")}
          name="commune_code"
          options={[{ value: "", label: loading ? t("loading") : t("choose") }, ...communes]}
          defaultValue={value("commune_code")}
          disabled={!province || loading}
          error={state.fields?.commune_code}
        />
        <Field
          label={t("line")}
          name="line"
          defaultValue={value("line")}
          error={state.fields?.line}
        />
        <div className="fld-row">
          <Field
            label={t("opens")}
            name="opens"
            type="time"
            defaultValue={value("opens")}
            error={state.fields?.opens}
          />
          <Field
            label={t("closes")}
            name="closes"
            type="time"
            defaultValue={value("closes")}
            error={state.fields?.closes}
          />
        </div>
        <p className="fhint">{t("hoursHint")}</p>
        <CheckField
          name="pickup"
          label={t("pickup")}
          hint={t("pickupHint")}
          defaultChecked={checked("pickup")}
        />
      </Fragment>
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button type="submit" className="btn pri" disabled={pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
