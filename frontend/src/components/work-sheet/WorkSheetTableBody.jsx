import { ChevronDown, ChevronRight } from "lucide-react";
import { STAGE_DOT_COLORS, formatGroupMinutes, getGroupInitials } from "./workSheetTableConfig";
import { TableBody, TableCell, TableRow } from "../ui/table";
import { WORKSHEET } from "@/constants/testIds";
import { WorkSheetRow } from "./WorkSheetRow";
import { avatarColorClasses } from "@/lib/avatarColors";

export function WorkSheetTableBody(ctx) {
  const { activeCell, bottomSpacerHeight, clearRowDrag, clientNameOf, clients, collabIndex, columnOrder, columnSort, columnWidths, currentUser, deliverablesByProject, displayEntries, displayRowNumberById, draggedRowIds, dropTarget, effectiveHiddenColumns, fillState, frozenLefts, getCollabMemberIds, gridTemplateColumns, groupBySafe, handleCellSelect, handleCheckboxClickCapture, handleCheckboxDragEnter, handleCheckboxDragStart, handleCheckboxRangeSelect, handleCheckboxToggle, handleExtendSelection, handleFillEnd, handleFillHover, handleFillStart, handleRowDragOver, handleRowDragStart, handleRowDrop, hiddenRowsBeforeById, nonAdminUsers, onAddCollaborators, onDelete, onDuplicateRow, onRequestHideRow, onUpdate, openQtyPanel, options, projectLookalikes, projects, qtyPanel, rangeSelection, recentProjectsByCreator, restoreHiddenRows, reviewerUsers, rowObserver, selectedSet, selection, sortedTableItems, toggleGroupCollapse, topSpacerHeight, totalCols, users, usersById, visibleItems, wrappedColumns } = ctx;
  return (
    <>
    <TableBody>
      {displayEntries.length === 0 ? (
        <TableRow>
          <td
            colSpan={totalCols}
            data-testid={WORKSHEET.emptyState}
            className="py-16 text-center"
          >
            <p className="text-sm font-medium text-slate-700">
              No work items yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Add a row to start logging work.
            </p>
          </td>
        </TableRow>
      ) : (
        <>
          {topSpacerHeight > 0 && (
            <TableRow aria-hidden="true">
              <td
                colSpan={totalCols}
                style={{ height: topSpacerHeight, padding: 0 }}
              />
            </TableRow>
          )}

          {visibleItems.map((entry) => {
            if (entry.type === "header") {
              const { key, isCollapsed, label, summary } = entry;

              return (
                <TableRow
                  key={`group-${key}`}
                  className="h-10 border-b border-slate-200 bg-[#f7f9fc] hover:bg-[#f7f9fc]"
                  style={{
                    display: "grid",
                    gridTemplateColumns,
                    minWidth: "max-content",
                  }}
                >
                  <TableCell
                    className="flex h-10 items-center gap-2 px-3 text-[13px]"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(key)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
                      aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {groupBySafe === "Stage" && (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          STAGE_DOT_COLORS[key] || "bg-slate-400"
                        }`}
                      />
                    )}

                    {groupBySafe === "Member" && (
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(
                          key === "__unassigned__" ? null : key
                        )}`}
                      >
                        {getGroupInitials(label)}
                      </span>
                    )}

                    <span className="truncate font-semibold text-slate-800">
                      {label}
                    </span>

                    <span className="shrink-0 text-slate-500">
                      {groupBySafe === "Stage"
                        ? `${summary.count}`
                        : `${summary.count} row${summary.count === 1 ? "" : "s"} · ${formatGroupMinutes(
                            summary.minutes
                          )}`}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }

            const { item, rowIndex } = entry;
            const index = rowIndex;

            return (
              <WorkSheetRow
                key={item.id}
                activeCell={activeCell}
                selection={selection}
                rangeSelection={rangeSelection}
                totalRows={sortedTableItems.length}
                onExtendSelection={handleExtendSelection}
                onCheckboxRangeSelect={handleCheckboxRangeSelect}
                fillState={fillState}
                onCellSelect={handleCellSelect}
                onFillStart={handleFillStart}
                onFillHover={handleFillHover}
                onFillEnd={handleFillEnd}
                item={item}
                index={index}
                currentUser={currentUser}
                users={users}
                usersById={usersById}
                nonAdminUsers={nonAdminUsers}
                reviewerUsers={reviewerUsers}
                options={options}
                clients={clients}
                projects={projects}
                deliverablesByProject={deliverablesByProject}
                clientNameOf={clientNameOf}
                lookalikes={projectLookalikes}
                recentProjectsByCreator={recentProjectsByCreator}
                onUpdate={onUpdate}
                collabCount={
                  item.collab_group_id
                    ? Math.max(0, (collabIndex?.get(item.collab_group_id)?.length || 1) - 1)
                    : 0
                }
                getCollabMemberIds={getCollabMemberIds}
                onAddCollaborators={onAddCollaborators}
                onOpenQty={openQtyPanel}
                qtyPanelOpen={qtyPanel?.id === item.id}
                onDelete={onDelete}
                onDuplicate={onDuplicateRow}
                hiddenColumns={effectiveHiddenColumns}
                frozenLefts={frozenLefts}
                wrappedColumns={wrappedColumns}
                columnOrder={columnOrder}
                columnWidths={columnWidths}
                onRowDragStart={handleRowDragStart}
                onRowDragOver={handleRowDragOver}
                onRowDrop={(event, rowId) => {
                  event.preventDefault();
                  handleRowDrop(event, rowId);
                }}
                onRowDragEnd={clearRowDrag}
                isRowDragging={draggedRowIds.includes(item.id)}
                dropIndicator={dropTarget?.id === item.id ? dropTarget.pos : null}
                dragCount={selectedSet.has(item.id) ? selectedSet.size : 0}
                onCheckboxDragStart={handleCheckboxDragStart}
                onCheckboxDragEnter={handleCheckboxDragEnter}
                onCheckboxClickCapture={handleCheckboxClickCapture}
                rowObserver={rowObserver}
                canDragRow={!columnSort.key}
                selected={selectedSet.has(item.id)}
                onToggleSelect={(id) => handleCheckboxToggle(id, index)}
                displayRowNumber={displayRowNumberById[item.id]}
                hiddenRowIdsBefore={hiddenRowsBeforeById[item.id] || []}
                hiddenRowIdsAfter={
                  item.id === sortedTableItems[sortedTableItems.length - 1]?.id
                    ? hiddenRowsBeforeById.__trailing__ || []
                    : []
                }
                onUnhideRows={restoreHiddenRows}
                onHideRow={(rowId) => {
                  onRequestHideRow?.(rowId);
                }}
              />
            );
          })}

          {bottomSpacerHeight > 0 && (
            <TableRow aria-hidden="true">
              <td
                colSpan={totalCols}
                style={{ height: bottomSpacerHeight, padding: 0 }}
              />
            </TableRow>
          )}
        </>
      )}
    </TableBody>
    </>
  );
}
