// Hàm thuần cho màn Webhook và Nhà phát triển: trạng thái của endpoint và gộp lần giao của mọi
// endpoint thành một danh sách. Core chưa có danh sách lần giao xuyên endpoint (bước 52), nên trang
// đọc lần giao của từng endpoint rồi gộp ở đây.
import type { components } from "@autoxide/sdk";

type Endpoint = components["schemas"]["EndpointResponse"];
type Delivery = components["schemas"]["DeliveryResponse"];
type LastDelivery = components["schemas"]["LastDelivery"];

/** Đang nhận, đang lỗi (lần giao gần nhất chưa thành) hay đã tắt. */
export type EndpointState = "receiving" | "failing" | "disabled";

/**
 * Trạng thái của endpoint theo lần giao gần nhất (`last_delivery`). Lỗi: lần giao đã bỏ (`failed`)
 * hay đang chờ thử lại sau một lần bị trả lời lỗi (`pending` mà đã có mã HTTP). Thành công là
 * `succeeded` (giá trị core thật trả; tài liệu của `LastDelivery` ghi `delivered`, nhận cả hai).
 */
export function endpointState(
  endpoint: Pick<Endpoint, "disabled_at">,
  last: Pick<LastDelivery, "status" | "response_status"> | null,
): EndpointState {
  if (endpoint.disabled_at) return "disabled";
  if (!last) return "receiving";
  if (last.status === "failed") return "failing";
  if (last.status === "pending" && last.response_status != null) return "failing";
  return "receiving";
}

export interface EndpointDelivery extends Delivery {
  endpoint: Pick<Endpoint, "id" | "url" | "description">;
}

/**
 * Gộp lần giao của nhiều endpoint, mới nhất trước, lọc theo trạng thái (`pending`, `succeeded`,
 * `failed`), giữ tối đa `limit` dòng.
 */
export function mergeDeliveries(
  lists: readonly { endpoint: Endpoint; deliveries: readonly Delivery[] }[],
  { status, limit = 50 }: { status?: string; limit?: number } = {},
): EndpointDelivery[] {
  return lists
    .flatMap(({ endpoint, deliveries }) =>
      deliveries.map((delivery) => ({
        ...delivery,
        endpoint: { id: endpoint.id, url: endpoint.url, description: endpoint.description },
      })),
    )
    .filter((delivery) => !status || delivery.status === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Tên miền và đường dẫn của địa chỉ, bỏ `https://`, để hiện gọn. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Lớp nhãn theo trạng thái của một lần giao. */
export const DELIVERY_BADGE: Record<string, string> = {
  succeeded: "badge b-ok",
  pending: "badge b-warn",
  failed: "badge b-bad",
};
