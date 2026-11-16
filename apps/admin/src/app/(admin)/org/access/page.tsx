import { redirect } from "next/navigation";
import { USERS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// `/org/access` mở tab đầu tiên người xem được dùng (layout đã chặn người không có tab nào).
export default async function AccessPage() {
  redirect((await can(USERS_READ)) ? "/org/access/users" : "/org/access/roles");
}
