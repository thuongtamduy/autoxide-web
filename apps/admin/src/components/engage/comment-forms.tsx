"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { createBan, saveProfile, setTargetCloses } from "@/app/(admin)/marketing/comments/actions";
import { saveCommentPolicy } from "@/app/(admin)/marketing/comments/sample-actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { BAN_KINDS, type BanKind } from "@/lib/comments";
import { isoToLocal, localToIso } from "@/lib/engage";
import { useHydrated } from "@/lib/hydrated";

/**
 * "Cấm": theo tài khoản, email hay dấu vết mạng đã băm. Mở từ một bình luận thì điền sẵn giá trị
 * của tác giả theo cách đã chọn. Lý do bắt buộc (để lưu hồ sơ); bỏ trống "tới" là cấm mãi.
 */
export function BanDialog({
  choices = [],
  label,
  small = true,
}: {
  choices?: readonly { kind: BanKind; value: string }[];
  label?: string;
  small?: boolean;
}) {
  const t = useTranslations("engage.comments.ban");
  return (
    <Dialog
      label={label ?? t("open")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={small ? "btn sm danger" : "btn danger"}
    >
      {(close) => <BanForm choices={choices} close={close} />}
    </Dialog>
  );
}

function BanForm({
  choices,
  close,
}: {
  choices: readonly { kind: BanKind; value: string }[];
  close: () => void;
}) {
  const t = useTranslations("engage.comments.ban");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const first = choices.find((c) => c.kind === "email") ?? choices[0];
  const [kind, setKind] = useState<BanKind>(first?.kind ?? "email");
  const [value, setValue] = useState(first?.value ?? "");
  const [until, setUntil] = useState("");
  const [state, run, pending] = useSubmit(createBan, () => {
    close();
    toast(t("done"));
  });
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("until", until ? (localToIso(until) ?? "") : "");
    run(data);
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <SelectField
        label={t("kind")}
        name="kind"
        value={kind}
        onChange={(event) => {
          const next = event.target.value as BanKind;
          setKind(next);
          const known = choices.find((c) => c.kind === next);
          if (known) setValue(known.value);
        }}
        options={BAN_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        error={state.fields?.kind}
      />
      <Field
        label={t("value")}
        name="value"
        mono
        value={value}
        onChange={(event) => setValue(event.target.value)}
        hint={t(`valueHint.${kind}`)}
        error={state.fields?.value}
      />
      <TextareaField
        label={t("reason")}
        name="reason"
        rows={2}
        maxLength={500}
        defaultValue={state.values?.reason ?? ""}
        error={state.fields?.reason}
      />
      <Field
        label={t("until")}
        name="until_local"
        type="datetime-local"
        value={until}
        onChange={(event) => setUntil(event.target.value)}
        hint={t("untilHint")}
        error={state.fields?.until}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}

/** Đặt hay bỏ giờ tự đóng bình luận của một đích (giờ theo máy người xem). */
export function ClosesForm({
  type,
  target,
  current,
}: {
  type: string;
  target: string;
  current?: string | null | undefined;
}) {
  const t = useTranslations("engage.comments.closes");
  const hydrated = useHydrated();
  const toast = useToast();
  const [local, setLocal] = useState(() => isoToLocal(current));
  const [state, run, pending] = useSubmit(setTargetCloses, () =>
    toast(local ? t("set") : t("removed")),
  );
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("at", local ? (localToIso(local) ?? "") : "");
    run(data);
  };
  return (
    <form onSubmit={onSubmit} noValidate className="filters">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="target" value={target} />
      <Field
        label={t("label")}
        name="closes_local"
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        hint={t("hint")}
        error={state.fields?.closes_at}
      />
      <div className="filters-acts">
        <button type="submit" className="btn" disabled={pending || !hydrated}>
          {t("save")}
        </button>
        {local ? (
          <button type="button" className="btn ghost" onClick={() => setLocal("")}>
            {t("clear")}
          </button>
        ) : null}
      </div>
      {state.error ? <FormAlert state={state} /> : null}
    </form>
  );
}

/** Tên hiển thị của chính người quản trị khi bình luận (core đòi trước khi bình luận). */
export function ProfileForm({ current }: { current: string | null }) {
  const t = useTranslations("engage.comments.profile");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(saveProfile, () => toast(t("saved")));
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="filters">
      <Field
        label={t("label")}
        name="display_name"
        maxLength={50}
        defaultValue={state.values?.display_name ?? current ?? ""}
        hint={t("hint")}
        error={state.fields?.display_name}
      />
      <div className="filters-acts">
        <button type="submit" className="btn" disabled={pending}>
          {t("save")}
        </button>
      </div>
      {state.error ? <FormAlert state={state} /> : null}
    </form>
  );
}

/**
 * Cài đặt bình luận của khách này (dữ liệu mẫu, W-006): khách không tài khoản, cách duyệt, mức
 * xác thực tài khoản (NĐ 147/2024). Lỗi theo ô như form gọi core thật.
 */
export function PolicyForm({
  initial,
}: {
  initial: {
    guests_allowed: boolean;
    guest_moderation: string;
    user_moderation: string;
    posting: string;
  };
}) {
  const t = useTranslations("engage.comments.policy");
  const toast = useToast();
  const [state, run, pending] = useSubmit(saveCommentPolicy, () => toast(t("saved")));
  const modes = ["pre", "first_time", "post"].map((m) => ({ value: m, label: t(`mode.${m}`) }));
  return (
    <form action={run} className="dlg-form">
      <label className="check">
        <input type="checkbox" name="guests_allowed" defaultChecked={initial.guests_allowed} />
        <span className="check-main">
          <span className="check-name">{t("guests")}</span>
          <span className="check-desc">{t("guestsHint")}</span>
        </span>
      </label>
      {state.fields?.guests_allowed ? <p className="ferr">{state.fields.guests_allowed}</p> : null}
      <div className="fld-row">
        <SelectField
          label={t("guestModeration")}
          name="guest_moderation"
          defaultValue={initial.guest_moderation}
          options={modes}
          error={state.fields?.guest_moderation}
        />
        <SelectField
          label={t("userModeration")}
          name="user_moderation"
          defaultValue={initial.user_moderation}
          options={modes}
          error={state.fields?.user_moderation}
        />
      </div>
      <SelectField
        label={t("posting")}
        name="posting"
        defaultValue={initial.posting}
        options={["none", "phone", "identity"].map((p) => ({ value: p, label: t(`level.${p}`) }))}
        hint={t("postingHint")}
        error={state.fields?.posting}
      />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
