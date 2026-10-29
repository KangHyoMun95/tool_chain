export function StatTile({
  label,
  value,
  tone = "purple",
}: {
  label: string;
  value: string;
  tone?: "purple" | "amber";
}) {
  return (
    <div className="card card-glass card-sm stat-tile">
      <p className="micro-label micro-label-light">{label}</p>
      <p className={`metric metric-lg ${tone === "amber" ? "metric-amber-dark" : "metric-purple"}`}>
        {value}
      </p>
    </div>
  );
}
