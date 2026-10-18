export function csvCell(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function csv(rows: string[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
