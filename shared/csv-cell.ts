/** User-entered text remains text when opened by spreadsheet applications. */
export function csvCell(value:string):string{const safe=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`;}
