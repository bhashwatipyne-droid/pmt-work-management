// Single source of truth for worksheet column widths.
// WorkSheetTable.jsx (header) and WorkSheetRow.jsx (body rows) both
// import this so the CSS-grid columns always line up. Do not fork
// this object again in either file.
export const COLUMN_WIDTHS = {
  Date: "130px",
  Client: "150px",
  Project: "160px",
  Deliverable: "160px",
  Stage: "110px",
  "Deliverable Name": "180px",
  "Deliverable Link": "180px",
  Type: "150px",
  Category: "140px",
  Version: "100px",
  "Time (min)": "110px",
  Creator: "140px",
  Reviewer: "140px",
  Remarks: "200px",
  Status: "170px",
};

export const ROW_NUM_WIDTH = "44px";
export const CHECKBOX_WIDTH = "44px";
export const ACTIONS_WIDTH = "52px";

export const buildGridTemplateColumns = (visibleColumns) =>
  `${ROW_NUM_WIDTH} ${CHECKBOX_WIDTH} ${visibleColumns
    .map((column) => COLUMN_WIDTHS[column] || "150px")
    .join(" ")} ${ACTIONS_WIDTH}`;
