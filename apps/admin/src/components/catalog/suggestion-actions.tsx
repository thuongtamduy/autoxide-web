import { getTranslations } from "next-intl/server";
import { applySuggestionAction, discardSuggestionAction } from "@/app/(admin)/catalog/actions";
import { InlineAction } from "@/components/ui/confirm";

/** "Áp dụng" / "Bỏ" một bản nháp AI. Áp dụng chép vào bản dịch và bật dấu `ai_assisted`. */
export async function SuggestionActions({ id }: { id: string }) {
  const t = await getTranslations("catalog.ai");
  return (
    <span className="item-acts">
      <InlineAction action={applySuggestionAction} id={id} label={t("apply")} done={t("applied")} />
      <InlineAction
        action={discardSuggestionAction}
        id={id}
        label={t("discard")}
        done={t("discarded")}
      />
    </span>
  );
}
