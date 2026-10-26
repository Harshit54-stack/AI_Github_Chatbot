import { useNavigate } from "react-router-dom";
import RepositoryStats from "./RepositoryStats";

/**
 * Sidebar — shows repository context, metadata, and navigation shortcuts.
 *
 * @param {{ repoMeta: object | null }} props
 *   repoMeta — the RepositoryMeta object returned by POST /repository/clone,
 *              or null if no repository has been loaded yet.
 */
export default function Sidebar({ repoMeta }) {
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex flex-col w-72 bg-white/[0.03] border-r border-white/10 p-5 gap-6 shrink-0 overflow-y-auto">
      {/* Branding */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/40">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">Repo Assistant</span>
      </div>

      {/* Repository name */}
      <div className="shrink-0">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">Repository</p>
        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-3">
          {repoMeta ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white truncate">{repoMeta.repository_name}</p>
              <p className="text-[11px] text-violet-300 font-mono truncate">
                {repoMeta.owner}/{repoMeta.repository_name}
              </p>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-[10px] text-emerald-400 font-medium">Cloned successfully</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No repository loaded</p>
          )}
        </div>
      </div>

      {/* Metadata / Stats */}
      {repoMeta ? (
        <div className="flex-1 min-h-0">
          <RepositoryStats meta={repoMeta} />
        </div>
      ) : (
        <div className="shrink-0">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">Stats</p>
          <div className="grid grid-cols-2 gap-2">
            {["Files", "Supported", "Folders", "Ignored"].map((label) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-white">—</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation shortcuts */}
      {repoMeta && (
        <div className="shrink-0 space-y-1.5">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">Navigate</p>
          {[
            { label: "🌳 Explorer", path: "/explorer", hover: "hover:text-violet-300 hover:border-violet-500/30" },
            { label: "⚡ Chunks", path: "/chunks", hover: "hover:text-amber-300 hover:border-amber-500/30" },
            { label: "🧠 Embeddings", path: "/embeddings", hover: "hover:text-indigo-300 hover:border-indigo-500/30" },
            { label: "🗄️ Vector DB", path: "/vector", hover: "hover:text-cyan-300 hover:border-cyan-500/30" },
            { label: "💬 AI Chat", path: "/chat", hover: "hover:text-violet-300 hover:border-violet-500/30" },
          ].map(({ label, path, hover }) => (
            <button
              key={path}
              onClick={() => navigate(path, { state: { repoMeta } })}
              className={`w-full text-left text-[11px] text-slate-400 border border-white/10 rounded-lg px-3 py-2 transition-colors ${hover}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Phase indicator */}
      <div className="mt-auto shrink-0">
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-center">
          <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-widest">
            Phase 7 · AI Chat ✓
          </span>
        </div>
      </div>
    </aside>
  );
}
