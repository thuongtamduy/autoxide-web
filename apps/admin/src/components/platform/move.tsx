"use client";

// Phần chạy ở trình duyệt của việc dời khách (W-032): form chọn đích để chạy thử (form GET của
// `next/form`: đích nằm trên địa chỉ, máy chủ chạy thử khi dựng trang, chạy cả khi không có
// JavaScript) và bộ làm mới trang khi lượt dời còn chạy. Mọi lời gọi core ở máy chủ.
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";

/** Chọn placement đích và có giữ bản cũ không, rồi chạy thử (`?move_to=…&keep_source=1`). */
export function MovePlanForm({
  action,
  targets,
  to,
  keepSource,
}: {
  /** Trang của khách: form gửi về đó. */
  action: string;
  targets: readonly { name: string; label: string }[];
  to: string | undefined;
  keepSource: boolean;
}) {
  const t = useTranslations("platform.tenant.move");
  const id = useId();
  return (
    <Form action={action} scroll={false} className="pf-move-form">
      <div className="fld">
        <label className="lab" htmlFor={`${id}-to`}>
          {t("to")}
        </label>
        <select
          id={`${id}-to`}
          className="inp"
          name="move_to"
          defaultValue={to ?? targets[0]?.name}
        >
          {targets.map((target) => (
            <option key={target.name} value={target.name}>
              {target.label}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" name="keep_source" value="1" defaultChecked={keepSource} />
        <span className="check-main">
          <span className="check-name">{t("keepSource")}</span>
          <span className="check-desc">{t("keepSourceHint")}</span>
        </span>
      </label>
      <div className="eg-acts">
        <button type="submit" className="btn sm">
          {t("dryRun")}
        </button>
      </div>
    </Form>
  );
}

/**
 * Làm mới trang (dữ liệu dựng ở máy chủ) mỗi `seconds` giây khi lượt dời còn chạy; dừng khi trang
 * dựng lại với lượt đã xong (component không còn được vẽ).
 */
export function MovePoll({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
