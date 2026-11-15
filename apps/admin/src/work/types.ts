// Kiểu của hộp việc, số liệu tóm tắt và việc thiết lập, theo đúng hình dạng của đặc tả bước 51 của
// core (`docs/steps/51-ui-contracts.md`: `WorkSource`, `WorkItem` P2 + P10, `SummaryMetric` P4,
// `SetupStep` P10). Khi core có `GET /api/v1/kernel/work`, `/work/counts`, `/summary`, `/setup` thì
// giao diện đọc đúng các kiểu này từ core thay cho sổ nguồn ở `src/work/sources.ts` (W-020).
import type { Money } from "@/sample/catalog";

/** Mức gấp của một việc; hộp việc sắp theo mức này rồi theo hạn. */
export type Severity = "blocking" | "attention" | "info";

/** Giá trị điền vào câu: số, chữ, tiền (định dạng theo ngôn ngữ lúc hiện) hay ngày lịch. */
export type MessageParam = string | number | { money: Money } | { day: string };

/** Câu cho người đọc: i18n key + tham số, như `Message` của core (core dịch theo `Accept-Language`). */
export interface WorkMessage {
  key: string;
  params?: Record<string, MessageParam>;
}

/** Một việc trong hộp việc (`WorkItem` của bước 51, thêm `key` và `reason` của P10). */
export interface WorkItem {
  /** Khoá ổn định `<nguồn>:<id bản ghi hay nhóm>`; trạng thái hoãn / giao gắn vào khoá này. */
  key: string;
  /** Id của nguồn, vd `orders.unconfirmed`. */
  source: string;
  severity: Severity;
  title: WorkMessage;
  detail: WorkMessage | null;
  /** Hạn xử lý (UTC); `null` = không có hạn. */
  due_at: string | null;
  /** Màn xử lý: `item` là id màn của sổ điều hướng, `href` là đường dẫn mở thẳng tới bản ghi / bộ lọc. */
  target: { item: string; href: string };
  /** Số bản ghi việc này gom lại (vd 12 đơn); dùng cho số đếm trên menu. */
  count: number;
  /**
   * "Vì sao bạn thấy": permission của nguồn và nút. Core điền nút từ `Scope` (bước 34); giao diện
   * chưa có nút thật nên điền ở `registry` (cả khách, hay gốc cây mẫu).
   */
  reason: { permission: string | null; scope: WorkMessage };
}

/** Ngữ cảnh một lần đọc hộp việc: người xem (để lọc permission) và giờ đọc. */
export interface WorkContext {
  /** Người xem có permission này (hoặc một trong danh sách). */
  can: (permission: string | readonly string[]) => boolean;
  /** Module đã cài trên core; `null` khi không đọc được sổ module. */
  modules: readonly string[] | null;
  /** Đang bật dữ liệu mẫu. */
  sample: boolean;
  now: number;
}

/** Một nguồn việc (`WorkSource` của bước 51): mỗi phân hệ khai các nguồn của mình. */
export interface WorkSource {
  /** `<module>.<việc>`, cũng là khoá của số đếm. */
  id: string;
  /** Nhóm điều hướng (phân hệ) của nguồn, để hiện nhãn và biểu tượng. */
  group: string;
  /** Có một trong các permission này thì thấy việc của nguồn. `null`: nguồn tự lọc từng việc. */
  permission: readonly string[] | null;
  /** Module của core phải có (nguồn đọc API thật). */
  module?: string;
  /** Nguồn đọc dữ liệu mẫu, chờ API của bước `step` (W-006). */
  sample?: { step: string; endpoint: string };
  /** Số bản ghi đang chờ (số đếm trên menu). */
  count: (ctx: WorkContext) => Promise<number>;
  /** Các việc, tối đa `limit`. */
  items: (ctx: WorkContext, limit: number) => Promise<WorkItem[]>;
}

/** Kết quả gom hộp việc: như `GET /api/v1/kernel/work` của core. */
export interface WorkBox {
  data: WorkItem[];
  /** Nguồn lỗi hay quá hạn thời gian: bị bỏ qua, không làm hỏng cả hộp. */
  incomplete: string[];
}

/** Số đếm theo nguồn: như `GET /api/v1/kernel/work/counts` của core. */
export interface WorkCounts {
  data: Record<string, number>;
  incomplete: string[];
}

/** Giá trị của một số liệu tóm tắt (`MetricValue` của bước 51). */
export type MetricValue =
  | { kind: "money"; value: Money }
  | { kind: "count"; value: number }
  | { kind: "ratio"; numerator: number; denominator: number };

/** Một số liệu của trang Tổng quan (`SummaryMetric` của bước 51). */
export interface SummaryMetric {
  id: string;
  group: string;
  permission: readonly string[];
  module?: string;
  sample?: { step: string; endpoint: string };
  /** Màn mở khi bấm ô. */
  href: string;
  value: (ctx: WorkContext) => Promise<{ value: MetricValue; note: WorkMessage | null }>;
}

/** Một số liệu đã đọc, kèm nguồn để ô ghi rõ thật hay mẫu. */
export interface MetricView {
  id: string;
  group: string;
  href: string;
  value: MetricValue;
  note: WorkMessage | null;
  sample: { step: string; endpoint: string } | null;
  module: string | null;
}

/** Một bước thiết lập (`SetupStep` của bước 51 P10): trạng thái tính từ dữ liệu. */
export interface SetupView {
  id: string;
  done: boolean;
  /** Bước pháp lý: chưa xong thì chưa được bán. */
  blocking: boolean;
  /** Vì sao chưa xong. */
  note: WorkMessage | null;
  href: string;
}
