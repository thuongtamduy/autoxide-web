// Chạy một lần khi máy chủ của giao diện khởi động (quy ước `instrumentation.ts` của Next.js, W-020).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { warmSampleData } = await import("./sample/warm");
    await warmSampleData();
  } catch {
    // Dựng sẵn chỉ để trang đầu nhanh hơn: lỗi thì kho tự dựng ở lần đọc đầu, như trước.
  }
}
