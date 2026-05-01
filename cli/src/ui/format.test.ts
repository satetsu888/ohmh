import { describe, expect, it } from "vitest";
import { formatTimeOnly, formatTimestamp, renderTable } from "./format";

describe("renderTable", () => {
  it("renders header and rows with column padding", () => {
    const out = renderTable(
      [
        { id: "wh_a", kind: "persistent" },
        { id: "wh_xyz", kind: "ephemeral" },
      ],
      [
        { header: "ID", get: (r) => r.id },
        { header: "KIND", get: (r) => r.kind },
      ],
    );
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("ID      KIND");
    expect(lines[1]).toBe("wh_a    persistent");
    expect(lines[2]).toBe("wh_xyz  ephemeral");
  });

  it("truncates cells exceeding maxWidth with an ellipsis", () => {
    const out = renderTable(
      [{ name: "this-is-a-very-long-name" }],
      [{ header: "NAME", get: (r) => r.name, maxWidth: 10 }],
    );
    const lines = out.split("\n");
    // Trailing ellipsis brings the cell to exactly 10 characters.
    expect(lines[1]).toBe("this-is-a…");
    expect(lines[1].length).toBe(10);
  });

  it("returns just the header line when given an empty row set", () => {
    const out = renderTable([], [{ header: "ID", get: () => "" }]);
    expect(out).toBe("ID");
  });
});

describe("formatTimestamp", () => {
  it("formats a Date into YYYY-MM-DD HH:mm:ss in local time", () => {
    const d = new Date(2026, 3, 29, 14, 5, 9);
    expect(formatTimestamp(d)).toBe("2026-04-29 14:05:09");
  });

  it("falls back to the original string for invalid input", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTimeOnly", () => {
  it("returns HH:mm:ss in local time", () => {
    const d = new Date(2026, 3, 29, 7, 4, 1);
    expect(formatTimeOnly(d)).toBe("07:04:01");
  });
});
