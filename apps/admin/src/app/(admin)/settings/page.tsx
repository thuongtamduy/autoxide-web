import { redirect } from "next/navigation";
import { generalTabs } from "./(general)/tabs";

// `/settings` mở tab đầu tiên của Cài đặt chung người xem được dùng (không tính tab Nhân sự, là
// link sang màn khác). Không có tab nào thì về trang API key, ai đăng nhập cũng dùng được.
export default async function SettingsPage() {
  const first = (await generalTabs()).find((tab) => !tab.external);
  redirect(first ? first.href : "/settings/api-keys");
}
