"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createFolder, deleteFolder, renameFolder } from "@/app/(admin)/content/media/actions";
import { Icon } from "@/components/shell/icon";
import { ConfirmAction } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { type MediaFilters, type MediaFolder, mediaHref } from "@/lib/media";

/** Đường từ gốc tới thư mục `id` (gồm cả nó). */
export function folderPath(folders: readonly MediaFolder[], id: string | undefined): MediaFolder[] {
  const path: MediaFolder[] = [];
  let current = id ? folders.find((f) => f.id === id) : undefined;
  while (current && path.length < 32) {
    path.unshift(current);
    const parent = current.parent_id;
    current = parent ? folders.find((f) => f.id === parent) : undefined;
  }
  return path;
}

/**
 * Hàng thư mục: "Mọi thư mục", "Gốc", đường tới thư mục đang mở và thư mục con của nó. Thư mục đang
 * mở đổi tên và xoá được (core chỉ xoá thư mục trống).
 */
export function FolderBar({
  folders,
  filters,
  canWrite,
}: {
  folders: MediaFolder[];
  filters: MediaFilters;
  canWrite: boolean;
}) {
  const t = useTranslations("media.folders");
  const current = filters.folder && filters.folder !== "root" ? filters.folder : undefined;
  const path = folderPath(folders, current);
  const children = folders.filter((f) => (f.parent_id ?? undefined) === current);
  const open = path.at(-1);
  const chip = (label: string, folder: string | undefined, on: boolean, key: string) => (
    <Link
      key={key}
      className={on ? "chip on" : "chip"}
      href={mediaHref(filters, { folder, item: undefined })}
      aria-current={on ? "true" : undefined}
    >
      <Icon name="folder" small />
      {label}
    </Link>
  );
  return (
    <div className="md-folders">
      <nav className="chips md-chiprow" aria-label={t("label")}>
        {chip(t("all"), undefined, !filters.folder, "all")}
        {chip(t("root"), "root", filters.folder === "root", "root")}
        {path.map((folder) => chip(folder.name, folder.id, folder.id === current, folder.id))}
        {children.map((folder) => (
          <Link
            key={folder.id}
            className="chip md-sub"
            href={mediaHref(filters, { folder: folder.id, item: undefined })}
          >
            <Icon name="folder" small />
            {folder.name}
            <span className="cnt" title={t("itemCount", { count: folder.item_count })}>
              {folder.item_count}
            </span>
          </Link>
        ))}
      </nav>
      {open && canWrite ? (
        <span className="md-folder-acts">
          <RenameFolderDialog folder={open} />
          <ConfirmAction
            action={deleteFolder}
            id={open.id}
            label={t("delete")}
            title={t("deleteTitle", { name: open.name })}
            points={[t("deleteEmpty"), t("deleteKeep")]}
            submit={t("delete")}
            done={t("deleted")}
          />
        </span>
      ) : null}
    </div>
  );
}

function FolderForm({
  action,
  close,
  done,
  hidden,
  initial,
  submit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  close: () => void;
  done: string;
  hidden: Record<string, string>;
  initial: string;
  submit: string;
}) {
  const t = useTranslations("media.folders");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(done);
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
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormAlert state={state} />
      <Field
        label={t("name")}
        name="name"
        defaultValue={state.values?.name ?? initial}
        error={state.fields?.name}
        maxLength={255}
        autoComplete="off"
        required
        autoFocus
      />
      <DialogButtons submit={submit} pending={pending} close={close} />
    </form>
  );
}

/** "Thư mục mới" ở đầu trang: tạo trong thư mục đang mở. */
export function NewFolderDialog({ parentId }: { parentId?: string | undefined }) {
  const t = useTranslations("media.folders");
  return (
    <Dialog label={t("new")} title={t("newTitle")} intro={t("newIntro")} triggerClass="btn">
      {(close) => (
        <FolderForm
          action={createFolder}
          close={close}
          done={t("created")}
          hidden={{ parent_id: parentId ?? "" }}
          initial=""
          submit={t("create")}
        />
      )}
    </Dialog>
  );
}

function RenameFolderDialog({ folder }: { folder: MediaFolder }) {
  const t = useTranslations("media.folders");
  return (
    <Dialog label={t("rename")} title={t("renameTitle")}>
      {(close) => (
        <FolderForm
          action={renameFolder}
          close={close}
          done={t("renamed")}
          hidden={{ id: folder.id }}
          initial={folder.name}
          submit={t("rename")}
        />
      )}
    </Dialog>
  );
}
