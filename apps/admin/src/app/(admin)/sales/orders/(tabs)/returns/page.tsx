import { notFound } from "next/navigation";
import { ReturnsView } from "@/components/orders/returns-view";
import { can } from "@/lib/viewer";
import { ORDER_TABS } from "../../shared";

// Tab "Đổi trả và hoàn tiền": yêu cầu trả trong hạn 7 ngày sau khi giao; duyệt / từ chối kèm lý do,
// nhận hàng về (nhập lại kho hay hỏng), hoàn tiền qua đối tác (bút toán đảo, hoá đơn điều chỉnh).
export default async function ReturnsPage(props: PageProps<"/sales/orders/returns">) {
  if (!(await can(ORDER_TABS.returns))) notFound();
  return <ReturnsView base="/sales/orders/returns" params={await props.searchParams} />;
}
