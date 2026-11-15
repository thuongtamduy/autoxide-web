import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StoreReturnDialog } from "@/components/orders/forms";
import { ReturnsView } from "@/components/orders/returns-view";
import { can } from "@/lib/viewer";
import { STORE_TABS } from "../../orders/shared";

// Tab "Đổi trả tại quầy": yêu cầu trả mang tới cửa hàng; nhân viên nhận hàng tại quầy (tạo yêu cầu đã
// nhận nếu người mua tới thẳng), ghi tình trạng, hoàn tiền (tiền mặt trừ vào ca đang mở) hay đổi hàng.
export default async function StoreReturnsPage(props: PageProps<"/sales/stores/returns">) {
  if (!(await can(STORE_TABS.returns))) notFound();
  const t = await getTranslations("stores.returns");
  return (
    <div className="blocks">
      <section className="block">
        <div className="block-head">
          <p className="fhint">{t("about")}</p>
          <StoreReturnDialog />
        </div>
      </section>
      <ReturnsView
        base="/sales/stores/returns"
        params={await props.searchParams}
        method="in_store"
      />
    </div>
  );
}
