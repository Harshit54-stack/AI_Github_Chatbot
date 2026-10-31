/**
 * RepositoryStats — Displays repository telemetry in compact, elevated cards:
 *   • Language badges
 *   • File / folder / ignored counts
 *   • Owner & branch indicators
 */

const LANG_COLORS = {
  Python: { bg: "rgba(53, 114, 165, 0.2)", border: "rgba(53, 114, 165, 0.4)", text: "#93c5fd" },
  JavaScript: { bg: "rgba(247, 223, 30, 0.15)", border: "rgba(247, 223, 30, 0.3)", text: "#fde047" },
  TypeScript: { bg: "rgba(49, 120, 198, 0.2)", border: "rgba(49, 120, 198, 0.4)", text: "#7dd3fc" },
  "React (JSX)": { bg: "rgba(97, 218, 251, 0.15)", border: "rgba(97, 218, 251, 0.35)", text: "#67e8f9" },
  "React (TSX)": { bg: "rgba(97, 218, 251, 0.15)", border: "rgba(97, 218, 251, 0.35)", text: "#67e8f9" },
  Java: { bg: "rgba(176, 114, 25, 0.2)", border: "rgba(176, 114, 25, 0.4)", text: "#fdba74" },
  "C++": { bg: "rgba(243, 75, 125, 0.2)", border: "rgba(243, 75, 125, 0.4)", text: "#f472b6" },
  C: { bg: "rgba(100, 116, 139, 0.2)", border: "rgba(100, 116, 139, 0.4)", text: "#cbd5e1" },
  Go: { bg: "rgba(0, 173, 216, 0.2)", border: "rgba(0, 173, 216, 0.4)", text: "#5eead4" },
  Rust: { bg: "rgba(222, 165, 132, 0.2)", border: "rgba(222, 165, 132, 0.4)", text: "#fed7aa" },
  Markdown: { bg: "rgba(8, 63, 161, 0.2)", border: "rgba(8, 63, 161, 0.4)", text: "#93c5fd" },
};

const DEFAULT_LANG_COLOR = {
  bg: "rgba(139, 92, 246, 0.15)",
  border: "rgba(139, 92, 246, 0.3)",
  text: "#c4b5fd",
};

function LanguageBadge({ lang }) {
  const color = LANG_COLORS[lang] || DEFAULT_LANG_COLOR;
  return (
    <span
      style={{ backgroundColor: color.bg, borderColor: color.border, color: color.text }}
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono border leading-tight"
    >
      {lang}
    </span>
  );
}

function StatCard({ value, label }) {
  const displayValue = typeof value === "number" ? value.toLocaleString() : (value ?? 0);
  return (
    <div className="bg-[#14151D] border border-white/[0.08] rounded-xl p-2.5 text-center shadow-inner hover:border-white/20 transition-colors">
      <p className="text-sm font-bold text-white tabular-nums">{displayValue}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

export default function RepositoryStats({ meta }) {
  if (!meta) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* 2x2 Telemetry Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard value={meta.total_files} label="Total Files" />
        <StatCard value={meta.supported_files} label="Supported" />
        <StatCard value={meta.folder_count} label="Folders" />
        <StatCard value={meta.ignored_files} label="Ignored" />
      </div>

      {/* Languages Pills */}
      {meta.languages && meta.languages.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-medium px-1">
            Stack
          </p>
          <div className="flex flex-wrap gap-1">
            {meta.languages.map((lang) => (
              <LanguageBadge key={lang} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
