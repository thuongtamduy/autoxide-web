/** Kết quả của một Server Action có một nút (link trong thư, tuỳ chọn bản tin). */
export interface ActionState {
  status: "idle" | "ok" | "error";
  message: string;
}
