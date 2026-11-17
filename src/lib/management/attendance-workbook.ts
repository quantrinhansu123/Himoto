import { formatDateTime } from '@/lib/formatters';
import { addDays, vietnamDate } from './duty-roster';
import { addFilteredExcelSheet } from './excel-export';

type AttendanceRecord = {
  id: number;
  staff_id: number | string;
  staff_name: string;
  store_name: string | null;
  shift_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  earned_credit: number | null;
};

const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const staffOrder = new Intl.Collator('vi', { numeric: true });
const dayLabel = (iso: string) => iso.slice(5).split('-').reverse().join('/');

export async function buildAttendanceWorkbook(records: AttendanceRecord[], from: string, to: string) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  const sheet = book.addWorksheet('Theo nhân sự', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }],
  });
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  const columnCount = 4 + dates.length;
  sheet.columns = [12, 28, 26, 16, ...dates.map(() => 17)].map(width => ({ width }));
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = `Lịch sử chấm công · ${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}`;
  sheet.getRow(1).height = 25;
  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.addRow(['Mã nhân sự', 'Họ tên', 'Cơ sở', 'Lượt chấm', ...dates.map(dayLabel)]);
  sheet.addRow([null, null, null, null, ...dates.map(date => weekdays[new Date(date).getUTCDay()])]);
  for (let column = 1; column <= 4; column++) sheet.mergeCells(2, column, 3, column);
  for (const rowNumber of [2, 3]) {
    const row = sheet.getRow(rowNumber);
    row.height = 19;
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27354A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  const people = new Map<string, { name: string; stores: Set<string>; days: Map<string, AttendanceRecord[]> }>();
  const sorted = [...records].sort((a, b) => Date.parse(a.clock_in_at) - Date.parse(b.clock_in_at) || a.id - b.id);
  for (const record of sorted) {
    const id = String(record.staff_id);
    const day = vietnamDate(new Date(record.clock_in_at));
    const person = people.get(id) ?? { name: record.staff_name, stores: new Set<string>(), days: new Map<string, AttendanceRecord[]>() };
    person.name = record.staff_name;
    person.stores.add(record.store_name || 'Chưa gắn cơ sở');
    const dayRecords = person.days.get(day) ?? [];
    dayRecords.push(record);
    person.days.set(day, dayRecords);
    people.set(id, person);
  }

  const staff = [...people].sort(([idA, a], [idB, b]) => staffOrder.compare(a.name, b.name) || staffOrder.compare(idA, idB));
  for (const [personIndex, [id, person]] of staff.entries()) {
    const firstRow = sheet.rowCount + 1;
    const maxSessions = Math.max(...[...person.days.values()].map(day => day.length));
    for (let session = 0; session < maxSessions; session++) {
      const suffix = maxSessions > 1 ? ` ${session + 1}` : '';
      const entries = dates.map(date => person.days.get(date)?.[session]);
      const clockIn = sheet.addRow([null, null, null, `Giờ vào${suffix}`, ...entries.map(record =>
        record ? timeFormat.format(new Date(record.clock_in_at)) : null)]);
      const clockOut = sheet.addRow([null, null, null, `Giờ ra${suffix}`, ...entries.map((record, index) => {
        if (!record) return null;
        if (!record.clock_out_at) return 'Chưa ra ca';
        const instant = new Date(record.clock_out_at);
        const date = vietnamDate(instant);
        const time = timeFormat.format(instant);
        return date === dates[index] ? time : `${dayLabel(date)} ${time}`;
      })]);
      for (const row of [clockIn, clockOut]) {
        row.height = 19;
        for (let column = 1; column <= columnCount; column++) {
          const cell = row.getCell(column);
          cell.alignment = { vertical: 'middle', horizontal: column <= 4 ? 'left' : 'center', wrapText: column <= 3 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: personIndex % 2 ? 'FFF0F4F8' : 'FFFFFFFF' } };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDE4ED' } }, right: { style: 'thin', color: { argb: 'FFDDE4ED' } } };
        }
      }
    }
    for (const [index, value] of [id, person.name, [...person.stores].join(', ')].entries()) {
      const column = index + 1;
      sheet.mergeCells(firstRow, column, sheet.rowCount, column);
      sheet.getCell(firstRow, column).value = value;
    }
  }

  addFilteredExcelSheet(book, 'Chi tiết', [
    'ID', 'Nhân viên', 'Cơ sở', 'Ca làm', 'Giờ vào', 'Giờ ra', 'Số phút đi muộn', 'Số phút về sớm', 'Công thực tế',
  ], records.map(record => [
    record.id, record.staff_name, record.store_name, record.shift_name, formatDateTime(record.clock_in_at),
    record.clock_out_at ? formatDateTime(record.clock_out_at) : null, record.late_minutes, record.early_leave_minutes, record.earned_credit,
  ]));
  return new Uint8Array(await book.xlsx.writeBuffer());
}
