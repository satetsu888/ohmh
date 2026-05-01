import { VscodeTableCell } from "@vscode-elements/react-elements";

type Props = {
  expanded: boolean;
  onToggle: () => void;
};

/** Leading chevron cell that toggles row expansion. Visual is identical regardless of state. */
export const ExpandToggleCell = ({ expanded, onToggle }: Props) => (
  <VscodeTableCell>
    <div
      role="button"
      aria-label={expanded ? "Collapse" : "Expand"}
      onClick={onToggle}
      style={{
        textAlign: "center",
        verticalAlign: "middle",
        cursor: "pointer",
        padding: "2px",
      }}
    >
      <span
        className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
        style={{ fontSize: 14 }}
      />
    </div>
  </VscodeTableCell>
);
