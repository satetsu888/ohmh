// Table formatting. Implemented with hand-rolled padding to avoid extra dependencies.

export type Column<T> = {
  header: string;
  get: (row: T) => string;
  // Maximum column width (unlimited when omitted). Overflow is truncated with an ellipsis.
  maxWidth?: number;
};

const truncate = (s: string, max: number | undefined): string => {
  if (max === undefined || s.length <= max) {
    return s;
  }
  if (max <= 1) {
    return s.slice(0, max);
  }
  return s.slice(0, max - 1) + "…";
};

export const renderTable = <T>(rows: T[], columns: Column<T>[]): string => {
  const cells: string[][] = [];
  const headers = columns.map((c) => c.header);
  cells.push(headers);
  for (const row of rows) {
    cells.push(columns.map((c) => truncate(c.get(row), c.maxWidth)));
  }

  const widths = headers.map((_, i) => Math.max(...cells.map((row) => row[i].length)));

  // No separator line under the header (keep output minimal, ngrok/curl-style).
  return cells
    .map((row) =>
      row
        .map((cell, i) => {
          if (i === row.length - 1) {
            return cell;
          }
          return cell.padEnd(widths[i]);
        })
        .join("  "),
    )
    .join("\n");
};

export const formatTimestamp = (input: string | number | Date): string => {
  const d = typeof input === "number" ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return String(input);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

export const formatTimeOnly = (input: string | number | Date): string => {
  const d = typeof input === "number" ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return String(input);
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mi}:${ss}`;
};
