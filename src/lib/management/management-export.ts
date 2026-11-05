import type { ManagementColumn, ManagementConfig, ManagementRow } from './types';
import { optionLabel } from './config';
import { csvCell, formatValue } from './table-utils';

export function managementExportRows(config: ManagementConfig, columns: ManagementColumn[], rows: ManagementRow[]) {
  return rows.map(row => columns.map(column => column.key === 'rental_period'
    ? 'Bắt đầu: ' + formatValue(row.start_date, 'datetime') + ' / Dự kiến trả: ' + formatValue(row.end_date, 'datetime')
    : optionLabel(config, column.key, formatValue(row[column.key], column.format))));
}
/** Shared by the web table and mobile export; preserve labels and CSV escaping. */
export function buildManagementCsv(config: ManagementConfig, columns: ManagementColumn[], rows: ManagementRow[]) {
  return '\uFEFF' + [columns.map(column => csvCell(column.label)).join(','), ...rows.map(row => columns.map(column => csvCell(column.key === 'rental_period'
    ? `Bắt đầu: ${formatValue(row.start_date, 'datetime')} / Dự kiến trả: ${formatValue(row.end_date, 'datetime')}`
    : optionLabel(config, column.key, formatValue(row[column.key], column.format)))).join(','))].join('\r\n');
}
