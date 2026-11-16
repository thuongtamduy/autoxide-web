import { eraseCommentsData, lookupCommentsData } from "@/app/(admin)/marketing/comments/actions";
import { Forbidden } from "@/components/engage/common";
import { DataByEmail } from "@/components/engage/data-by-email";
import { COMMENTS_EXPORT } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Tab "Dữ liệu theo email" của Bình luận: bình luận của khách viết bằng một email, theo dõi trả
// lời, lệnh cấm; tải về hoặc xoá (chữ, tên, email, dấu vết mạng; giữ chỗ trong luồng).
export default async function CommentsDataPage() {
  if (!(await can(COMMENTS_EXPORT))) return <Forbidden permission={COMMENTS_EXPORT} />;
  return (
    <DataByEmail kind="comments" lookup={lookupCommentsData} erase={eraseCommentsData} canErase />
  );
}
