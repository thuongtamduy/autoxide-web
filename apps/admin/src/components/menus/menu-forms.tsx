"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { type NewMenuState, newMenu } from "@/app/(admin)/content/menus/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { CONTENT_LOCALES } from "@/lib/content";

/** "Menu mới" (`POST /api/v1/menus`): khoá (`main`, `footer`…), ngôn ngữ, chép từ một menu có sẵn. */
export function NewMenuDialog({ copyFrom }: { copyFrom: { id: string; label: string }[] }) {
  const t = useTranslations("menus.create");
  return (
    <Dialog label={t("button")} title={t("title")} intro={t("intro")} triggerClass="btn pri">
      {(close) => <NewMenuForm copyFrom={copyFrom} close={close} />}
    </Dialog>
  );
}

function NewMenuForm({
  copyFrom,
  close,
}: {
  copyFrom: { id: string; label: string }[];
  close: () => void;
}) {
  const t = useTranslations("menus.create");
  const locales = useTranslations("content.locales");
  const toast = useToast();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit<NewMenuState>(newMenu, (done) => {
    close();
    toast(t("created"));
    // Mở ngay menu vừa tạo để thêm mục.
    if (done.menuId) router.push(`/content/menus?menu=${done.menuId}`);
  });
  useFocusInvalid(form, state);
  return (
    <form
      ref={form}
      className="dlg-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(new FormData(event.currentTarget));
      }}
    >
      <FormAlert state={state} />
      <Field
        label={t("key")}
        name="key"
        mono
        defaultValue={state.values?.key ?? ""}
        error={state.fields?.key}
        hint={t("keyHint")}
        autoComplete="off"
        required
      />
      <SelectField
        label={t("locale")}
        name="locale"
        defaultValue={state.values?.locale ?? "vi"}
        error={state.fields?.locale}
        options={CONTENT_LOCALES.map((code) => ({ value: code, label: locales(code) }))}
      />
      <SelectField
        label={t("copy")}
        name="copy_from"
        defaultValue={state.values?.copy_from ?? ""}
        options={[
          { value: "", label: t("blank") },
          ...copyFrom.map((m) => ({ value: m.id, label: m.label })),
        ]}
        hint={t("copyHint")}
      />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
