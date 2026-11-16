import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/work/activity-list";
import { AUDIT_READ } from "@/lib/permissions";
import { recentActivity } from "@/work/server";

// Tab "Hoạt động": việc đã làm gần đây, câu đọc được dựng từ nhật ký audit THẬT của core. Người không
// có `audit.read` chưa xem được (chờ `GET /api/v1/audit/activity` của bước 51 P5, lọc theo quyền đọc
// từng bản ghi).
export default async function ActivityPage() {
  const t = await getTranslations("work.activity");
  const activity = await recentActivity(50);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="wk-act-h">
        <div className="block-head">
          <h2 id="wk-act-h" className="h2">
            {t("title")}
          </h2>
        </div>
        <p className="fhint">{t("about")}</p>
        {activity === null ? (
          <p className="note">{t("forbidden", { permission: AUDIT_READ })}</p>
        ) : (
          <div className="card wk-card">
            <ActivityList lines={activity.lines} names={activity.names} />
          </div>
        )}
      </section>
    </div>
  );
}
