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
      <div
        className="text-[10px] text-slate-600 mb-1"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {label.toUpperCase()}
      </div>
      <div
        className="text-xl font-bold text-white"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </div>
      <div
        className="text-[10px] mt-0.5"
        style={{ fontFamily: "'JetBrains Mono', monospace", color }}
      >
        {unit}
      </div>
    </div>
  );
}

