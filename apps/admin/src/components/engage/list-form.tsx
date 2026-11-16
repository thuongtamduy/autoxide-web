"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef } from "react";
import { createList, updateList } from "@/app/(admin)/marketing/newsletter/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  CheckField,
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { suggestFormKey } from "@/lib/forms";
import { useHydrated } from "@/lib/hydrated";
import { NEW_POSTS, type NewsletterList } from "@/lib/newsletter";

/** Các ô của một danh sách nhận tin, dùng cho cả tạo và sửa. */
function ListFields({
  list,
  state,
  canSendPosts,
}: {
  list?: NewsletterList;
  state: FormState;
  canSendPosts: boolean;
}) {
  const t = useTranslations("engage.newsletter.listForm");
  const v = state.values ?? {};
  const e = state.fields ?? {};
  return (
    <>
      <div className="fld-row">
        <Field
          label={t("nameVi")}
          name="name_vi"
          defaultValue={v.name_vi ?? list?.name.vi ?? ""}
          error={e.name}
          autoFocus={!list}
          onBlur={(event) => {
            const key = event.currentTarget.form?.elements.namedItem("key");
            if (key instanceof HTMLInputElement && !key.value) {
              key.value = suggestFormKey(event.currentTarget.value);
            }
          }}
        />
        <Field label={t("nameEn")} name="name_en" defaultValue={v.name_en ?? list?.name.en ?? ""} />
      </div>
      <Field
        label={t("key")}
        name="key"
        mono
        defaultValue={v.key ?? list?.key ?? ""}
        hint={t("keyHint")}
        error={e.key}
      />
      <div className="fld-row">
        <Field
          label={t("descriptionVi")}
          name="description_vi"
          defaultValue={v.description_vi ?? list?.description.vi ?? ""}
          error={e.description}
        />
        <Field
          label={t("descriptionEn")}
          name="description_en"
          defaultValue={v.description_en ?? list?.description.en ?? ""}
        />
      </div>
      <CheckField
        label={t("doubleOptIn")}
        name="double_opt_in"
        defaultChecked={list?.double_opt_in ?? true}
        hint={t("doubleOptInHint")}
      />
      <CheckField
        label={t("public")}
        name="public"
        defaultChecked={list?.public ?? false}
        hint={t("publicHint")}
      />
      <div className="fld-row">
        <SelectField
          label={t("newPosts")}
          name="new_posts"
          defaultValue={list?.new_posts ?? "off"}
          options={NEW_POSTS.filter(
            (n) => n !== "send" || canSendPosts || list?.new_posts === "send",
          ).map((n) => ({ value: n, label: t(`newPostsMode.${n}`) }))}
          hint={t("newPostsHint")}
          error={e.new_posts}
        />
        <SelectField
          label={t("newPostLocale")}
          name="new_post_locale"
          defaultValue={list?.new_post_locale ?? "vi"}
          options={[
            { value: "vi", label: t("vi") },
            { value: "en", label: t("en") },
          ]}
        />
      </div>
    </>
  );
}

/** "Tạo danh sách" trong hộp thoại. */
export function CreateListDialog({ canSendPosts }: { canSendPosts: boolean }) {
  const t = useTranslations("engage.newsletter.listForm");
  return (
    <Dialog label={t("create")} title={t("createTitle")} intro={t("createIntro")}>
      {(close) => <CreateListForm close={close} canSendPosts={canSendPosts} />}
    </Dialog>
  );
}

function CreateListForm({ close, canSendPosts }: { close: () => void; canSendPosts: boolean }) {
  const t = useTranslations("engage.newsletter.listForm");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(createList, () => {
    close();
    toast(t("created"));
  });
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(new FormData(event.currentTarget));
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <ListFields state={state} canSendPosts={canSendPosts} />
      <FormAlert state={state} />
      <DialogButtons submit={t("createSubmit")} pending={pending} close={close} />
    </form>
  );
}

/** Sửa danh sách (gửi `If-Match`). */
export function ListEditForm({
  list,
  canSendPosts,
}: {
  list: NewsletterList;
  canSendPosts: boolean;
}) {
  const t = useTranslations("engage.newsletter.listForm");
  const hydrated = useHydrated();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(updateList, () => toast(t("saved")));
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(new FormData(event.currentTarget));
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <input type="hidden" name="id" value={list.id} />
      <input type="hidden" name="expect" value={list.updated_at} />
      <ListFields list={list} state={state} canSendPosts={canSendPosts} />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending || !hydrated}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
