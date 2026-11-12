/** Tách số giây thành đơn vị lớn nhất chia hết (86400 → 1 ngày, 90 → 90 giây). */
export function splitDuration(seconds: number): {
  unit: "seconds" | "minutes" | "hours" | "days";
  count: number;
} {
  const units = [
    ["days", 86_400],
    ["hours", 3_600],
    ["minutes", 60],
  ] as const;
  for (const [unit, size] of units) {
    if (seconds >= size && seconds % size === 0) {
      return { unit, count: seconds / size };
    }
  }
  return { unit: "seconds", count: seconds };
}
