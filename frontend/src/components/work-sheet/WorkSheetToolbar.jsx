import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Plus, X, Rows3, CheckCircle2 } from "lucide-react";
import { WORKSHEET } from "@/constants/testIds";

const ALL_VALUE = "__all__";

export const WorkSheetToolbar = ({ filters, setFilters, options, onAddRow, canAdd, resultCount, onBulkAdd, bulkAdding, onOpenCloseDeliverable }) => {
  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value === ALL_VALUE ? "" : value }));

  const clear = () => setFilters({ search: "", status: "", deliverable_type: "", work_category: "", month: "" });

  const hasFilters = filters.search || filters.status || filters.deliverable_type || filters.work_category || filters.month;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
      {onOpenCloseDeliverable && (
        <Button
          data-testid={WORKSHEET.closeDeliverableBtn}
          onClick={onOpenCloseDeliverable}
          size="sm"
          className="h-9 bg-emerald-600 hover:bg-emerald-700"
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> Deliverable Closed
        </Button>
      )}

      <Input
        data-testid={WORKSHEET.searchInput}
        placeholder="Search deliverable or remarks..."
        value={filters.search}
        onChange={(e) => update("search", e.target.value)}
        className="h-9 w-56"
      />

      <Select value={filters.status || ALL_VALUE} onValueChange={(v) => update("status", v)}>
        <SelectTrigger data-testid={WORKSHEET.statusFilter} className="h-9 w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
          {options.statuses?.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.deliverable_type || ALL_VALUE} onValueChange={(v) => update("deliverable_type", v)}>
        <SelectTrigger data-testid={WORKSHEET.typeFilter} className="h-9 w-[160px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All types</SelectItem>
          {options.deliverable_types?.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.work_category || ALL_VALUE} onValueChange={(v) => update("work_category", v)}>
        <SelectTrigger data-testid={WORKSHEET.categoryFilter} className="h-9 w-[130px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All categories</SelectItem>
          {options.work_categories?.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        data-testid={WORKSHEET.monthFilter}
        type="month"
        value={filters.month}
        onChange={(e) => update("month", e.target.value)}
        className="h-9 w-[170px]"
      />

      {hasFilters && (
        <Button data-testid={WORKSHEET.clearFiltersBtn} variant="ghost" size="sm" className="h-9" onClick={clear}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}

      <span className="text-xs text-muted-foreground">{resultCount} row{resultCount === 1 ? "" : "s"}</span>

      {onBulkAdd && (
        <Button
          data-testid="worksheet-bulk-add-rows-btn"
          onClick={() => onBulkAdd(5)}
          disabled={bulkAdding}
          size="sm"
          variant="outline"
          className="ml-auto h-9"
        >
          <Rows3 className="mr-1 h-4 w-4" /> {bulkAdding ? "Adding rows..." : "Add 5 rows below"}
        </Button>
      )}

      {canAdd && (
        <Button data-testid={WORKSHEET.addRowBtn} onClick={onAddRow} size="sm" className={`h-9 bg-teal-700 hover:bg-teal-800 ${onBulkAdd ? "" : "ml-auto"}`}>
          <Plus className="mr-1 h-4 w-4" /> Add Row
        </Button>
      )}
    </div>
  );
};
