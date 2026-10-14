/** RFC 4180-style CSV. A UTF-8 BOM is prepended so Excel opens Kannada text correctly. */
export function toCsv(rows: string[][]): string {
  const escape = (value: string): string => {
    // Guard against spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + rows.map((row) => row.map(escape).join(',')).join('\r\n');
}
