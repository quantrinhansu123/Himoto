/** Danh mục ca chấm công theo quy định nhân sự. */
export const ATTENDANCE_SHIFTS = [
  { code: 'S', name: 'Ca sáng', start: '08:00', end: '17:00', credit: 1 },
  { code: 'G1', name: 'Ca sáng', start: '08:00', end: '12:00', credit: 0.5 },
  { code: 'G2', name: 'Ca chiều', start: '13:00', end: '17:00', credit: 0.5 },
  { code: 'G3', name: 'Ca tối', start: '17:00', end: '21:00', credit: 0.5 },
  { code: 'F', name: 'Ca cả ngày', start: '08:00', end: '21:00', credit: 1.5 },
  { code: 'O', name: 'Nghỉ', start: null, end: null, credit: 0 },
  { code: 'C', name: 'Ca chiều', start: '13:00', end: '21:00', credit: 1 },
] as const;

export function attendanceShift(name: string | null | undefined) {
  return ATTENDANCE_SHIFTS.find(shift => shift.code === name);
}

export const shiftCreditLabel = (credit: number) => credit.toLocaleString('vi-VN');
