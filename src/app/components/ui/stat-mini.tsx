export function StatMini({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-400 mb-1">{label.toUpperCase()}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs mt-0.5" style={{ color }}>
        {unit}
      </div>
    </div>
  );
}
