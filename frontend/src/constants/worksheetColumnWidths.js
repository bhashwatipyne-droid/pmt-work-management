// Single source of truth for worksheet column widths.
// WorkSheetTable.jsx (header) and WorkSheetRow.jsx (body rows) both
// import this so the CSS-grid columns always line up.

export const COLUMN_WIDTHS = {
  Date: "130px",
  Client: "150px",
  Project: "160px",
  Deliverable: "160px",
  Stage: "110px",
  "Deliverable Name": "180px",
  "Deliverable Link": "180px",
  "Deliverable Type": "170px",
  Category: "140px",
  Version: "100px",
  "Time (min)": "110px",
  Creator: "170px",
  Reviewer: "150px",
  Remarks: "200px",
  Status: "170px",
};

export const ROW_NUM_WIDTH = "44px";
export const CHECKBOX_WIDTH = "44px";
export const ACTIONS_WIDTH = "52px";

export const buildGridTemplateColumns = (
  visibleColumns,
  columnWidths = {}
) =>
  `${ROW_NUM_WIDTH} ${CHECKBOX_WIDTH} ${visibleColumns
    .map(
      (column) =>
        columnWidths[column] ||
        COLUMN_WIDTHS[column] ||
        "150px"
    )
    .join(" ")} ${ACTIONS_WIDTH}`;