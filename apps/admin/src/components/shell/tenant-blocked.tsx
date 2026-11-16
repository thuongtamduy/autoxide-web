import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/actions";
import { MessagePanel } from "@/components/message-panel";
import type { TenantBlock } from "@/lib/tenant-state";

// Thay cả khung khi khách bị chặn toàn bộ (thiết kế "Trạng thái toàn khung", tab Thanh báo): tạm khoá
// thì chỉ còn đăng xuất (liên hệ nhà vận hành); bảo trì thì thử lại sau. Câu chi tiết là `detail` của
// core (đã dịch theo ngôn ngữ của người dùng).
export async function TenantBlocked({ block, detail }: { block: TenantBlock; detail: string }) {
  const t = await getTranslations("shell.blocked");
  return (
    <div className="ax" data-testid={`tenant-${block}`}>
      <main className="content">
        <MessagePanel title={t(`${block}.title`)} message={t(`${block}.body`)}>
          <p className="fhint">{detail}</p>
          <div className="row-acts">
            {block === "maintenance" ? (
              // Form GET không có `action` (không cần JavaScript): tải lại đúng trang đang mở.
              <form method="get">
                <button type="submit" className="btn pri">
                  {t("retry")}
                </button>
              </form>
            ) : null}
            <form action={signOut}>
              <button type="submit" className="btn">
                {t("signOut")}
              </button>
            </form>
          </div>
        </MessagePanel>
      </main>
    </div>
  );
}
