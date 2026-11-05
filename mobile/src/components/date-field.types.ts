export interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}
export function dateLabel(value: string) {
  return value ? value.split("-").reverse().join("/") : "Chọn ngày";
}
export function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
