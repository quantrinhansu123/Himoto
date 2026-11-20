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

function attendanceShiftTime(time: string, offsetMinutes: number) {
  const [hours, minutes] = time.split(':').map(Number);
  const total = hours * 60 + minutes + offsetMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function splitAttendanceShiftHours(offsetMinutes = 0) {
  return ATTENDANCE_SHIFTS.filter(shift => shift.code === 'G1' || shift.code === 'G3')
    .map(shift => `${attendanceShiftTime(shift.start, offsetMinutes)}–${attendanceShiftTime(shift.end, offsetMinutes)}`)
    .join(' · ');
}

export const shiftCreditLabel = (credit: number) => credit.toLocaleString('vi-VN');
