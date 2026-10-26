import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import FolderTree from "../components/explorer/FolderTree";
import FileDetailPanel from "../components/explorer/FileDetailPanel";
import ErrorNotification from "../components/ErrorNotification";
import { useExplorer } from "../hooks/useExplorer";
import { getRepositoryTree } from "../services/api";
import { useState } from "react";

// ── Language colour pills ──────────────────────────────────────────────────
const LANG_PILL_COLORS = {
  Python:       "bg-blue-500/15 text-blue-300 border-blue-500/25",
  JavaScript:   "bg-yellow-500/15 text-yellow-300 border-yellow-500/25",
  TypeScript:   "bg-sky-500/15 text-sky-300 border-sky-500/25",
  "React (JSX)":"bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  "React (TSX)":"bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  Java:         "bg-orange-500/15 text-orange-300 border-orange-500/25",
  "C++":        "bg-pink-500/15 text-pink-300 border-pink-500/25",
  C:            "bg-gray-500/15 text-gray-300 border-gray-500/25",
  Go:           "bg-teal-500/15 text-teal-300 border-teal-500/25",
  Rust:         "bg-orange-400/15 text-orange-200 border-orange-400/25",
};

// ── Small stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent = "text-violet-400" }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className={`text-2xl shrink-0`}>{icon}</div>
      <div>
        <p className={`text-xl font-bold tabular-nums ${accent}`}>
          {value?.toLocaleString() ?? "—"}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Parse trigger panel ────────────────────────────────────────────────────
function ParsePanel({ repoMeta, isParsing, parseSummary, parseError, onParse, onDismissError }) {
  const isParsed = !!parseSummary;

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-[10px] text-white font-bold">P3</span>
            </div>
            <h2 className="text-sm font-semibold text-white">Repository Parser</h2>
            {isParsed && (
              <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-medium">
                ✓ Parsed
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {repoMeta
              ? `${repoMeta.owner}/${repoMeta.repository_name} · Tree-sitter AST analysis`
              : "Clone a repository first, then parse it to explore its structure."}
          </p>
        </div>

        <button
          id="parse-repo-btn"
          onClick={() => onParse(repoMeta?.repository_name || "")}
          disabled={!repoMeta || isParsing}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-indigo-500 active:scale-95 transition-all shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {isParsing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Parsing…
            </>
          ) : isParsed ? (
            "Re-Parse"
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
              Parse Repository
            </>
          )}
        </button>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="mt-3">
          <ErrorNotification message={parseError} onDismiss={onDismissError} />
        </div>
      )}

      {/* Parse summary pills */}
      {parseSummary && !parseError && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Files", value: parseSummary.files_parsed, color: "bg-violet-500/10 border-violet-500/20 text-violet-300" },
            { label: "Classes", value: parseSummary.classes, color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300" },
            { label: "Functions", value: parseSummary.functions, color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" },
          ].map(({ label, value, color }) => (
            <span key={label} className={`text-[11px] border rounded-full px-3 py-1 font-medium ${color}`}>
              {value.toLocaleString()} {label}
            </span>
          ))}
          {parseSummary.languages.map((lang) => (
            <span
              key={lang}
              className={`text-[11px] border rounded-full px-3 py-1 font-medium ${LANG_PILL_COLORS[lang] || "bg-slate-500/10 border-slate-500/20 text-slate-300"}`}
            >
              {lang}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ExplorerPage ──────────────────────────────────────────────────────
/**
 * ExplorerPage — Repository Explorer with parse trigger, folder tree,
 * and file detail panel. Route: /explorer
 */
export default function ExplorerPage() {
  const location = useLocation();
  const navigate = useNavigate();

  /** repoMeta is passed via navigation state from HomePage/ChatPage. */
  const repoMeta = location.state?.repoMeta ?? null;

  const [tree, setTree] = useState([]);
  const [treeError, setTreeError] = useState(null);

  const {
    parseSummary,
    parsedFilesMap,
    repoSummary,
    selectedFile,
    selectedPath,
    isParsing,
    isLoadingFile,
    parseError,
    fileError,
    triggerParse,
    selectFile,
    clearErrors,
  } = useExplorer();

  // Fetch repo tree once on mount (if repo is available)
  useEffect(() => {
    if (!repoMeta) return;
    getRepositoryTree()
      .then(({ tree: t }) => setTree(t || []))
      .catch(() => setTreeError("Failed to load repository tree."));
  }, [repoMeta]);

  return (
    <MainLayout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* ── Top header bar ─────────────────────────────────── */}
        <header className="flex items-center gap-4 px-5 py-3.5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md shrink-0">
          <button
            onClick={() => navigate(repoMeta ? "/chat" : "/", { state: { repoMeta } })}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">Repository Explorer</h1>
              {repoMeta && (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {repoMeta.owner}/{repoMeta.repository_name}
                </p>
              )}
            </div>
          </div>

          {/* Navigate to Chat */}
          {repoMeta && (
            <button
              onClick={() => navigate("/chat", { state: { repoMeta } })}
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-violet-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
              Open Chat
            </button>
          )}

          {/* Navigate to Chunks */}
          {repoMeta && (
            <button
              onClick={() => navigate("/chunks", { state: { repoMeta } })}
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-amber-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-amber-500/30"
            >
              <span>⚡</span>
              Chunks
            </button>
          )}

          {/* Phase badge */}
          <span className="hidden sm:block text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full px-2.5 py-1 font-semibold uppercase tracking-widest shrink-0">
            Phase 3
          </span>
        </header>

        {/* ── Page body ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* ── Parse trigger + stats row ─────────────── */}
          <div className="px-5 pt-4 pb-3 space-y-3 shrink-0">
            <ParsePanel
              repoMeta={repoMeta}
              isParsing={isParsing}
              parseSummary={parseSummary}
              parseError={parseError}
              onParse={triggerParse}
              onDismissError={clearErrors}
            />

            {/* Aggregate stat cards */}
            {repoSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Files Parsed" value={repoSummary.total_files} icon="📄" accent="text-violet-400" />
                <StatCard label="Classes" value={repoSummary.total_classes} icon="🏛️" accent="text-indigo-400" />
                <StatCard label="Functions" value={repoSummary.total_functions} icon="⚡" accent="text-emerald-400" />
                <StatCard label="Languages" value={repoSummary.languages.length} icon="🌐" accent="text-sky-400" />
              </div>
            )}
          </div>

          {/* ── Two-pane explorer ─────────────────────── */}
          {!repoMeta ? (
            /* No repo loaded state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 select-none">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-600/10 border border-violet-500/10 flex items-center justify-center">
                <span className="text-3xl">📂</span>
              </div>
              <div>
                <p className="text-slate-300 font-medium">No Repository Loaded</p>
                <p className="text-slate-600 text-sm mt-1">Clone a repository from the home page first.</p>
              </div>
              <button
                onClick={() => navigate("/")}
                className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 hover:text-white transition-all"
              >
                Go to Home →
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex gap-0 min-h-0">
              {/* Left: Folder tree */}
              <div className="w-72 shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                    Files
                    {Object.keys(parsedFilesMap).length > 0 && (
                      <span className="ml-1.5 text-slate-600">
                        ({Object.keys(parsedFilesMap).length})
                      </span>
                    )}
                  </p>
                </div>
                {treeError && (
                  <p className="text-[11px] text-red-400 px-4 py-2">{treeError}</p>
                )}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {tree.length === 0 && !treeError ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                      <span className="text-xl">📂</span>
                      <p className="text-[11px] text-slate-600 text-center px-4">
                        {parseSummary
                          ? "No files in tree."
                          : "Parse the repository to see files."}
                      </p>
                    </div>
                  ) : (
                    <FolderTree
                      tree={tree}
                      selectedPath={selectedPath}
                      onFileSelect={selectFile}
                      parsedFilesMap={parsedFilesMap}
                    />
                  )}
                </div>
              </div>

              {/* Right: File detail */}
              <div className="flex-1 overflow-hidden min-w-0">
                {fileError && (
                  <div className="px-5 pt-4">
                    <ErrorNotification message={fileError} onDismiss={clearErrors} />
                  </div>
                )}
                <FileDetailPanel
                  file={selectedFile}
                  isLoading={isLoadingFile}
                  error={fileError && !selectedFile ? fileError : null}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
