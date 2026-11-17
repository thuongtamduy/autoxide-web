import { getTranslations } from "next-intl/server";
import { createForm } from "@/app/(admin)/marketing/forms/actions";
import { Back, Forbidden, PageHead } from "@/components/engage/common";
import { FormEditor } from "@/components/engage/form-editor";
import { FORMS_MANAGE } from "@/lib/engage";
import { STARTER_FIELDS } from "@/lib/forms";
import { can } from "@/lib/viewer";

// Tạo form: trang riêng (không phải hộp thoại) vì danh sách trường dài. Form mới có sẵn ba trường
// hay dùng (`STARTER_FIELDS`) để sửa, không phải bắt đầu từ trống.
export default async function NewFormPage() {
  if (!(await can(FORMS_MANAGE))) return <Forbidden permission={FORMS_MANAGE} />;
  const t = await getTranslations("engage.forms");
  return (
    <div className="page">
      <Back href="/marketing/forms" label={t("back")} />
      <PageHead crumb={t("crumb")} title={t("newTitle")} description={t("newAbout")} />
      <FormEditor
        action={createForm}
        submit={t("editor.create")}
        cancelHref="/marketing/forms"
        initial={{
          name: "",
          key: "",
          status: "open",
          retentionDays: "",
          successVi: "",
          successEn: "",
          notifyEmails: "",
          replyTo: "email",
          origins: "",
          ipLimit: "",
          emailLimit: "",
          fields: [...STARTER_FIELDS],
        }}
      />
    </div>
  );
}
