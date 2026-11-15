import { Icon, type IconName } from "@/components/shell/icon";
import { fold } from "@/lib/fold";
import { mediaIdSrc } from "@/lib/media";

// Ảnh nhỏ của sản phẩm trong bảng: ảnh đầu tiên (qua route `/media/…` của giao diện), chưa có ảnh
// thì biểu tượng theo nhóm hàng để dòng vẫn dễ nhận.
const ICONS: [RegExp, IconName][] = [
  [/chao/, "pan"],
  [/noi|combo/, "pot"],
  [/dao|thot/, "knife"],
  [/hop|thuy tinh/, "glass"],
  [/bat|gom/, "bowl"],
  [/khan|vai/, "towel"],
];

export function Thumb({
  mediaId,
  name,
  categoryPath,
}: {
  mediaId: string | null;
  name: string;
  categoryPath: string;
}) {
  if (mediaId) {
    // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên)
    return <img className="cat-thumb" src={mediaIdSrc(mediaId)} alt="" />;
  }
  const text = fold(`${name} ${categoryPath}`);
  const icon = ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? "box";
  return (
    <span className="cat-thumb" aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}
