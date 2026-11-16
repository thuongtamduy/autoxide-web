import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/shell/icon";
import { Time } from "@/components/ui/time";
import { NAV } from "@/nav/nav";
import type { ActivityLine } from "@/work/activity";

function iconOf(group: string): IconName {
  return NAV.find((g) => g.id === group)?.icon ?? "task";
}

/**
 * Dòng hoạt động gần đây (dữ liệu thật của nhật ký audit): câu đọc được, thời điểm theo múi giờ người
 * xem, link tới bản ghi khi có. Người làm không đọc được tên thì hiện "Một người dùng".
 */
export async function ActivityList({
  lines,
  names,
}: {
  lines: readonly ActivityLine[];
  names: ReadonlyMap<string, string>;
}) {
  const [t, nav] = await Promise.all([getTranslations("work.activity"), getTranslations("nav")]);
  if (lines.length === 0) return <p className="empty">{t("empty")}</p>;
  return (
    <ul className="wk-acts-list">
      {lines.map((line) => {
        const actor =
          line.actor.kind === "user"
            ? (names.get(line.actor.id) ?? t("actors.someone"))
            : t(`actors.${line.actor.kind}`);
        const sentence = t(line.key, { actor, what: line.what || t("unnamed") });
        return (
          <li key={line.id} className="wk-act">
            <span className="sq-ic">
              <Icon name={iconOf(line.group)} />
            </span>
            <span className="wk-main">
              <span className="wk-title">
                {line.href ? <Link href={line.href}>{sentence}</Link> : sentence}
              </span>
              <span className="wk-meta">
                <Time value={line.at} />
                <span className="tag">{nav(`groups.${line.group}`)}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
