import { useState } from "react";

// ── Language colour map ───────────────────────────────────────────────────
const LANG_COLORS = {
  Python: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  JavaScript: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  TypeScript: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "React (JSX)": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "React (TSX)": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Java: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "C++": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  C: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  Go: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Rust: "bg-orange-400/20 text-orange-200 border-orange-400/30",
};
const DEFAULT_LANG_COLOR = "bg-violet-500/20 text-violet-300 border-violet-500/30";

// ── Small utility components ──────────────────────────────────────────────
function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
        {title}
      </h3>
      {count !== undefined && (
        <span className="text-[10px] text-slate-600 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyNotice({ text }) {
  return <p className="text-xs text-slate-600 italic px-1">{text}</p>;
}

// ── Imports list ──────────────────────────────────────────────────────────
function ImportsList({ imports }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 5;
  const visible = expanded ? imports : imports.slice(0, MAX_VISIBLE);
  return (
    <div>
      <SectionHeader title="Imports" count={imports.length} />
      {imports.length === 0 ? (
        <EmptyNotice text="No imports detected" />
      ) : (
        <div className="space-y-1">
          {visible.map((imp, i) => (
            <p
              key={i}
              className="text-[11px] font-mono text-slate-400 bg-white/[0.03] border border-white/5 rounded-lg px-2.5 py-1.5 truncate"
              title={imp}
            >
              {imp}
            </p>
          ))}
          {imports.length > MAX_VISIBLE && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors px-1"
            >
              {expanded ? "Show less ▲" : `+${imports.length - MAX_VISIBLE} more ▼`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Functions list ────────────────────────────────────────────────────────
function FunctionsList({ functions, title = "Functions" }) {
  if (functions.length === 0) return null;
  return (
    <div>
      <SectionHeader title={title} count={functions.length} />
      <div className="space-y-1.5">
        {functions.map((fn, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-mono text-emerald-300 font-medium">
                {fn.name}
                <span className="text-slate-500">
                  ({fn.parameters?.map((p) => p.name).join(", ")})
                </span>
                {fn.return_type && (
                  <span className="text-violet-400"> → {fn.return_type}</span>
                )}
              </p>
              <span className="text-[9px] text-slate-600 shrink-0 tabular-nums">
                L{fn.start_line}–{fn.end_line}
              </span>
            </div>
            {fn.docstring && (
              <p className="text-[10px] text-slate-600 mt-1 truncate" title={fn.docstring}>
                {fn.docstring}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Classes accordion ─────────────────────────────────────────────────────
function ClassEntry({ cls }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-violet-400 font-mono">class</span>
          <span className="text-xs font-mono font-semibold text-white">{cls.name}</span>
          <span className="text-[9px] text-slate-600 tabular-nums">L{cls.start_line}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">
            {cls.methods?.length || 0} method{cls.methods?.length !== 1 ? "s" : ""}
          </span>
          <span className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
      </button>

      {open && cls.methods?.length > 0 && (
        <div className="border-t border-white/5 px-3 py-2 space-y-1">
          {cls.methods.map((m, i) => (
            <p key={i} className="text-[11px] font-mono text-slate-400">
              <span className="text-emerald-400">{m.name}</span>
              <span className="text-slate-600">({m.parameters?.map((p) => p.name).join(", ")})</span>
              {m.return_type && <span className="text-violet-400"> → {m.return_type}</span>}
              <span className="text-slate-700 ml-2">L{m.start_line}</span>
            </p>
          ))}
        </div>
      )}
      {open && (!cls.methods || cls.methods.length === 0) && (
        <div className="border-t border-white/5 px-3 py-2">
          <p className="text-[10px] text-slate-600 italic">No methods</p>
        </div>
      )}
    </div>
  );
}

function ClassesList({ classes }) {
  if (classes.length === 0) return null;
  return (
    <div>
      <SectionHeader title="Classes" count={classes.length} />
      <div className="space-y-1.5">
        {classes.map((cls, i) => (
          <ClassEntry key={i} cls={cls} />
        ))}
      </div>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────
/**
 * FileDetailPanel — shows parsed metadata for a selected file.
 *
 * @param {{
 *   file: object | null,     // ParsedFile from GET /parser/file/{path}
 *   isLoading: boolean,
 *   error: string | null,
 * }} props
 */
export default function FileDetailPanel({ file, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500">Loading file details…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
        <span className="text-2xl">⚠️</span>
        <p className="text-xs text-red-400 text-center">{error}</p>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-600/10 border border-violet-500/10 flex items-center justify-center">
          <span className="text-2xl">📄</span>
        </div>
        <div className="text-center">
          <p className="text-slate-400 font-medium text-sm">Select a file</p>
          <p className="text-slate-600 text-xs mt-1">Click any file in the tree to view its parsed structure</p>
        </div>
      </div>
    );
  }

  const langColor = LANG_COLORS[file.language] || DEFAULT_LANG_COLOR;
  const totalFunctions = (file.functions?.length || 0) + (file.classes?.reduce((s, c) => s + (c.methods?.length || 0), 0) || 0);

  return (
    <div className="h-full overflow-y-auto px-5 py-5 space-y-5">
      {/* File header */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{file.filename}</h2>
            <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{file.relative_path}</p>
          </div>
          <span className={`shrink-0 text-[10px] border rounded-lg px-2.5 py-1 font-medium ${langColor}`}>
            {file.language}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Lines", value: file.total_lines?.toLocaleString() },
            { label: "Classes", value: file.classes?.length ?? 0 },
            { label: "Functions", value: totalFunctions },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl p-2 text-center">
              <p className="text-sm font-bold text-white tabular-nums">{value}</p>
              <p className="text-[9px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Imports */}
      <ImportsList imports={file.imports || []} />

      {/* Classes */}
      <ClassesList classes={file.classes || []} />

      {/* Top-level functions */}
      {file.functions?.length > 0 && (
        <FunctionsList functions={file.functions} title="Functions" />
      )}

      {/* Empty state */}
      {!file.imports?.length && !file.classes?.length && !file.functions?.length && (
        <div className="text-center py-6">
          <p className="text-slate-600 text-xs">No code structures detected in this file.</p>
        </div>
      )}
    </div>
  );
}
