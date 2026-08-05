export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute rounded-full"
        style={{
          top: "-15%",
          left: "-8%",
          width: 700,
          height: 700,
          background:
            "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "25%",
          right: "-12%",
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          bottom: "-10%",
          left: "35%",
          width: 500,
          height: 500,
          background:
            "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
    </div>
  );
}
