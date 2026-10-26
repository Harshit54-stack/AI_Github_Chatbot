/**
 * RepositoryStats — displays repository metadata:
 *   • Language badges with colour coding
 *   • File / folder / ignored counts
 *   • Owner, branch info
 *
 * @param {{ meta: object }} props   meta is the RepositoryMeta response object
 */

// Language → colour mapping (Tailwind-compatible inline styles via CSS vars)
const LANG_COLORS = {
  Python: { bg: "#3572A5", text: "#fff" },
  JavaScript: { bg: "#F7DF1E", text: "#000" },
  TypeScript: { bg: "#3178C6", text: "#fff" },
  "React (JSX)": { bg: "#61DAFB", text: "#000" },
  "React (TSX)": { bg: "#61DAFB", text: "#000" },
  Java: { bg: "#B07219", text: "#fff" },
  "C++": { bg: "#F34B7D", text: "#fff" },
  C: { bg: "#555555", text: "#fff" },
  "C#": { bg: "#178600", text: "#fff" },
  Go: { bg: "#00ADD8", text: "#fff" },
  Rust: { bg: "#DEA584", text: "#000" },
  Markdown: { bg: "#083FA1", text: "#fff" },
  Text: { bg: "#64748b", text: "#fff" },
};

const DEFAULT_LANG_COLOR = { bg: "#6d28d9", text: "#fff" };

function LanguageBadge({ lang }) {
  const color = LANG_COLORS[lang] || DEFAULT_LANG_COLOR;
  return (
    <span
      style={{ backgroundColor: color.bg, color: color.text }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-tight whitespace-nowrap"
    >
      {lang}
    </span>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

export default function RepositoryStats({ meta }) {
  if (!meta) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Owner / Branch row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Owner</p>
          <p className="text-xs text-violet-300 font-mono truncate">{meta.owner}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Branch</p>
          <p className="text-xs text-emerald-300 font-mono truncate">{meta.branch || "HEAD"}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard value={meta.total_files} label="Total Files" />
        <StatCard value={meta.supported_files} label="Supported" />
        <StatCard value={meta.folder_count} label="Folders" />
        <StatCard value={meta.ignored_files} label="Ignored" />
      </div>

      {/* Language badges */}
      {meta.languages && meta.languages.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-medium">
            Languages
          </p>
          <div className="flex flex-wrap gap-1.5">
            {meta.languages.map((lang) => (
              <LanguageBadge key={lang} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
