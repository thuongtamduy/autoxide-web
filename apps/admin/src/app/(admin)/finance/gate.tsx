import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { can } from "@/lib/viewer";

/** Cửa của một tab: thiếu permission dự kiến của bước 36 thì báo như màn thật. `null` = được mở. */
export async function tabGate(permission: string): Promise<ReactNode | null> {
  return (await can(permission)) ? null : <Forbidden permission={permission} />;
}
