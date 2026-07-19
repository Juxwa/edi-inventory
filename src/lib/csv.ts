export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null;
};

function escapeCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((col: CsvColumn<T>) => escapeCell(col.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns.map((col: CsvColumn<T>) => escapeCell(col.value(row))).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
