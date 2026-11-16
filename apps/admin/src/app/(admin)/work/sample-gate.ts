import "server-only";

import { notFound } from "next/navigation";
import { sampleDataEnabled } from "@/sample";

/** Tab dựng hoàn toàn bằng dữ liệu mẫu: tắt dữ liệu mẫu thì không có (404), như `commerceGate`. */
export function sampleOnly(): void {
  if (!sampleDataEnabled()) notFound();
}
