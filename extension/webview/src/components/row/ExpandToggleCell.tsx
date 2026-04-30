import { VscodeTableCell } from "@vscode-elements/react-elements";

type Props = {
  expanded: boolean;
  onToggle: () => void;
};

/** 行頭のチェブロン (展開トグル)。表示は常に同じ。 */
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
