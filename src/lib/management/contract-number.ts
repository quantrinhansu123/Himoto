// NHAP/EXCEL references identify unfinished/imported records, not paper contracts.
export function paperContractNumber(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : '';
  return /^(NHAP|EXCEL)-/i.test(code) ? '' : code;
}

export function contractNumberError(value: string): string | null {
  return value.trim().length > 32 || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ? 'Số hợp đồng tối đa 32 ký tự, không chứa ký tự xuống dòng hoặc ký tự điều khiển.' : null;
}
