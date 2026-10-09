/**
 * Kiểm tra xem 2 khoảng thời gian có bị trùng nhau (overlap) không.
 * Điều kiện: (startA <= endB) && (endA >= startB)
 */
export const isDateOverlap = (startA, endA, startB, endB) => {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  return aStart <= bEnd && aEnd >= bStart;
};