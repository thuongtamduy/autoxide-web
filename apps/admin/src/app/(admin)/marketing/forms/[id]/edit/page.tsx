import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateForm } from "@/app/(admin)/marketing/forms/actions";
import { Back, Forbidden, PageHead } from "@/components/engage/common";
import { FormEditor } from "@/components/engage/form-editor";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { FORMS_MANAGE } from "@/lib/engage";
import { type Form, fieldFromCore } from "@/lib/forms";
import { can } from "@/lib/viewer";

// Sửa form. Đổi trường thì core tạo phiên bản mới; bài nộp cũ giữ nhãn của phiên bản của nó.
export default async function EditFormPage(props: PageProps<"/marketing/forms/[id]/edit">) {
  const { id } = await props.params;
  if (!(await can(FORMS_MANAGE))) return <Forbidden permission={FORMS_MANAGE} />;
  const t = await getTranslations("engage.forms");
  let form: Form;
  try {
    ({ data: form } = await load((client) =>
      client.GET("/api/v1/forms/{id}", { params: { path: { id } } }),
    ));
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={FORMS_MANAGE} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return (
    <div className="page">
      <Back href={`/marketing/forms/${id}`} label={t("backToForm")} />
      <PageHead
        crumb={t("crumb")}
        title={t("editTitle", { name: form.name })}
        description={t("editAbout", { version: form.version })}
      />
      <FormEditor
        action={updateForm}
        submit={t("editor.save")}
        initial={{
          id: form.id,
          expect: form.updated_at,
          name: form.name,
          key: form.key,
          status: form.status,
          retentionDays: text(form.retention_days),
          successVi: form.success_message.vi ?? "",
          successEn: form.success_message.en ?? "",
          notifyEmails: form.notify_emails.join("\n"),
          replyTo: form.reply_to_field ?? "",
          origins: form.allowed_origins.join("\n"),
          ipLimit: text(form.ip_limit_per_hour),
          emailLimit: text(form.email_limit_per_hour),
          fields: form.fields.map(fieldFromCore),
        }}
      />
    </div>
  );
}
