// 表整形。依存を増やさないため自前パディングで実装。

export type Column<T> = {
  header: string;
  get: (row: T) => string;
  // 列幅の上限 (省略時は無制限)。長すぎる場合は末尾を省略 (…) する。
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

  return cells
    .map((row, rowIdx) => {
      const line = row
        .map((cell, i) => {
          if (i === row.length - 1) {
            return cell;
          }
          return cell.padEnd(widths[i]);
        })
        .join("  ");
      // header の下に区切り線は引かない (ngrok / curl 風のシンプル出力)
      void rowIdx;
      return line;
    })
    .join("\n");
};

export const formatTimestamp = (input: string | number | Date): string => {
  const d = typeof input === "number" ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return String(input);
  }
  // YYYY-MM-DD HH:mm:ss (local)
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
