export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden transition-colors duration-500">
      {/* Primary ambient orb top-left */}
      <div
        className="absolute rounded-full transition-all duration-700 opacity-60 dark:opacity-100"
        style={{
          top: "-12%",
          left: "-6%",
          width: 750,
          height: 750,
          background:
            "radial-gradient(circle, rgba(124, 58, 237, 0.12) 0%, rgba(6, 182, 212, 0.05) 50%, transparent 70%)",
        }}
      />
      {/* Secondary ambient orb top-right */}
      <div
        className="absolute rounded-full transition-all duration-700 opacity-50 dark:opacity-100"
        style={{
          top: "20%",
          right: "-10%",
          width: 650,
          height: 650,
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, rgba(236, 72, 153, 0.04) 50%, transparent 70%)",
        }}
      />
      {/* Accent orb bottom */}
      <div
        className="absolute rounded-full transition-all duration-700 opacity-50 dark:opacity-100"
        style={{
          bottom: "-8%",
          left: "30%",
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.09) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 70%)",
        }}
      />
      {/* Subtle tech grid */}
      <div
        className="absolute inset-0 opacity-40 dark:opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(rgba(var(--neuro-cyan-rgb), 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--neuro-cyan-rgb), 0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}
