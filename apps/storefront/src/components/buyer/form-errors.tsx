import { useTranslations } from "next-intl";
import type { FieldError } from "@/sample/checkout";

// Lỗi của form người mua (giỏ, đặt hàng, tài khoản, tra cứu, đăng ký bán hàng). Lỗi đến theo hình dạng
// `errors[]` của Problem `validation_failed` của core (`field`, `code`, `params`): giao diện dịch `code`
// ở `formErrors.<code>`, không viết câu cứng. Dùng được ở Server Component và Client Component.

/** Hàm dịch một lỗi. */
export function useErrorText(): (error: FieldError) => string {
  const t = useTranslations("formErrors");
  return (error) => t(error.code, error.params ?? {});
}

/** Lỗi đầu tiên của một trường. */
export function errorFor(errors: readonly FieldError[], field: string): FieldError | undefined {
  return errors.find((error) => error.field === field);
}

/** Câu lỗi dưới một ô; `id` để ô trỏ tới bằng `aria-describedby`. */
export function ErrorText({ id, error }: { id: string; error: FieldError | undefined }) {
  const text = useErrorText();
  if (!error) return null;
  return (
    <span className="errtxt" id={id}>
      {text(error)}
    </span>
  );
}

/** Dải tóm tắt "Còn N chỗ cần sửa" ở đầu form (đọc ngay bằng `role="alert"`). */
export function ErrorSummary({ errors }: { errors: readonly FieldError[] }) {
  const t = useTranslations("formErrors");
  if (errors.length === 0) return null;
  return (
    <div className="by-alert" role="alert">
      {t("summary", { count: errors.length })}
    </div>
  );
}
