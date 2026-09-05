export const ProjectMetricCard = ({ label, value, testId }) => (
  <div
    data-testid={testId}
    className={[
      "rounded-xl",
      "border border-border",
      "bg-card",
      "p-5",
      "transition-shadow",
      "hover:shadow-sm",
    ].join(" ")}
  >
    <div className="text-xs font-medium text-muted-foreground">
      {label}
    </div>

    <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
      {value}
    </div>
  </div>
);