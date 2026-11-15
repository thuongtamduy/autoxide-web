import { eraseFormsData, lookupFormsData } from "@/app/(admin)/marketing/forms/actions";
import { Forbidden } from "@/components/engage/common";
import { DataByEmail } from "@/components/engage/data-by-email";
import { FORMS_EXPORT } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Tab "Dữ liệu theo email" của Biểu mẫu: mọi bài nộp có một email (người gửi form không có tài
// khoản), tải về hoặc xoá hẳn theo yêu cầu của chủ dữ liệu. Cần `forms.export`.
export default async function FormsDataPage() {
  if (!(await can(FORMS_EXPORT))) return <Forbidden permission={FORMS_EXPORT} />;
  return <DataByEmail kind="forms" lookup={lookupFormsData} erase={eraseFormsData} canErase />;
}
