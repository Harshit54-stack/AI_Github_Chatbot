import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import { useVectorStore } from "../hooks/useVectorStore";

// ── Constants & helpers ──────────────────────────────────────────────────────

const CHUNK_TYPE_META = {
  function:         { icon: "⚡", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  class:            { icon: "🏛️", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  method:           { icon: "🔧", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  module:           { icon: "📦", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  readme:           { icon: "📋", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  markdown_section: { icon: "📝", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
};

const LANG_COLORS = {
  Python:        "text-blue-300 bg-blue-500/10 border-blue-500/20",
  JavaScript:    "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
  TypeScript:    "text-sky-300 bg-sky-500/10 border-sky-500/20",
  "React (JSX)": "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  "React (TSX)": "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  Java:          "text-orange-300 bg-orange-500/10 border-orange-500/20",
  Go:            "text-teal-300 bg-teal-500/10 border-teal-500/20",
  Rust:          "text-orange-200 bg-orange-400/10 border-orange-400/20",
  Markdown:      "text-amber-300 bg-amber-500/10 border-amber-500/20",
};

function fmt(n) { return typeof n === "number" ? n.toLocaleString() : "—"; }

// ── Helper UI components ──────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent = "text-cyan-400", sub }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold tabular-nums truncate ${accent}`}>{value ?? "—"}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LangBadge({ language }) {
  const color = LANG_COLORS[language] || "text-slate-400 bg-slate-500/10 border-slate-500/20";
  return <span className={`text-[9px] border rounded px-1.5 py-0.5 font-mono ${color}`}>{language}</span>;
}

function TypeBadge({ type }) {
  const meta = CHUNK_TYPE_META[type] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] border rounded px-1.5 py-0.5 font-medium ${meta.color}`}>
      {meta.icon} {type.replace("_", " ")}
    </span>
  );
}

function ScoreBar({ score }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8 ? "from-emerald-500 to-teal-500" :
    score >= 0.6 ? "from-amber-500 to-orange-500" :
    "from-slate-600 to-slate-500";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono tabular-nums ${
        score >= 0.8 ? "text-emerald-400" :
        score >= 0.6 ? "text-amber-400" : "text-slate-500"
      }`}>
        {(score * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── FAISS Status card ─────────────────────────────────────────────────────────

function FaissStatusCard({ statistics, isReady }) {
  return (
    <div className={`rounded-2xl border p-5 flex items-start gap-4 ${
      isReady
        ? "bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border-cyan-500/20"
        : "bg-white/[0.03] border-white/10"
    }`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl ${
        isReady
          ? "bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/30"
          : "bg-white/5"
      }`}>
        🗄️
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-sm font-bold text-white">FAISS Index</h3>
          <span className={`text-[9px] rounded-full px-2 py-0.5 font-medium border ${
            isReady
              ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
              : "bg-slate-500/15 border-slate-500/25 text-slate-500"
          }`}>
            {isReady ? "✓ Ready" : "Not Built"}
          </span>
        </div>
        {statistics ? (
          <div className="space-y-1">
            <p className="text-xs text-cyan-300 font-mono">{statistics.index_type}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 mt-2">
              <span>Vectors: <span className="text-slate-300">{fmt(statistics.total_vectors)}</span></span>
              <span>Dim: <span className="text-slate-300">{statistics.embedding_dimension}</span></span>
              <span>Size: <span className="text-slate-300">{(statistics.index_size_bytes / 1024).toFixed(1)} KB</span></span>
            </div>
            {statistics.last_updated && (
              <p className="text-[10px] text-slate-600">
                Updated: {new Date(statistics.last_updated).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 mt-1">
            Build the index from Phase 5 embeddings to enable semantic search.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Search result card ────────────────────────────────────────────────────────

function SearchResultCard({ result, rank }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 hover:border-cyan-500/25 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Rank + symbol */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] text-slate-600 tabular-nums font-mono">#{rank}</span>
            <TypeBadge type={result.chunk_type} />
            <span className="text-sm font-mono font-bold text-white truncate max-w-[200px]">
              {result.symbol_name}
            </span>
          </div>
          {/* File + lines */}
          <p className="text-[10px] text-slate-500 font-mono truncate">{result.file_path}</p>
          <div className="flex items-center gap-2 mt-1">
            <LangBadge language={result.language} />
            <span className="text-[9px] text-slate-700">L{result.start_line}–{result.end_line}</span>
          </div>
          {/* Score bar */}
          <ScoreBar score={result.score} />
        </div>
      </div>

      {/* Content preview */}
      {result.content_preview && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
            Preview
          </button>
          {expanded && (
            <pre className="mt-2 text-[10px] font-mono text-slate-400 bg-black/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-white/5">
              {result.content_preview}
              {result.content_preview.length >= 300 && <span className="text-slate-600"> …</span>}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Search panel ──────────────────────────────────────────────────────────────

function SearchPanel({ repoName, isSearching, searchResults, searchError, onSearch, onClear }) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim(), topK, repoName);
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <h3 className="text-sm font-semibold text-white">Semantic Search Tester</h3>
          <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full px-2 py-0.5">
            No AI · Pure Vector
          </span>
        </div>
        {searchResults && (
          <button onClick={onClear} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Query form */}
      <form onSubmit={handleSubmit} className="p-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input
              id="vector-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. JWT authentication handler, database connection pool…"
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[10px] text-slate-500 whitespace-nowrap">Top-K</label>
            <select
              id="vector-topk-select"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="text-xs bg-white/5 border border-white/10 text-slate-300 rounded-xl px-2 py-2.5 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              {[3, 5, 10, 15, 20].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <button
            id="vector-search-btn"
            type="submit"
            disabled={!query.trim() || isSearching}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-teal-500 active:scale-95 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0"
          >
            {isSearching ? (
              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Searching…</>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {searchError && (
          <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {searchError}
          </p>
        )}
      </form>

      {/* Results */}
      {searchResults && (
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              Results <span className="text-slate-600">({searchResults.results.length})</span>
            </p>
            <span className="text-[10px] text-slate-600 tabular-nums">{searchResults.elapsed_ms}ms</span>
          </div>

          {searchResults.results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <span className="text-xl opacity-40">🔍</span>
              <p className="text-xs text-slate-600">No results found. Try a different query.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.results.map((result, i) => (
                <SearchResultCard key={result.chunk_id} result={result} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main VectorDashboard ──────────────────────────────────────────────────────

/**
 * VectorDashboard — Phase 6 FAISS Vector Database UI.
 * Route: /vector
 */
export default function VectorDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const repoMeta = location.state?.repoMeta ?? null;

  const {
    statistics,
    buildResult,
    searchResults,
    isBuilding,
    isSearching,
    buildError,
    searchError,
    statsError,
    loadStats,
    triggerBuild,
    triggerSearch,
    triggerDelete,
    clearErrors,
    clearResults,
  } = useVectorStore();

  const repoName = repoMeta?.repository_name ?? "";
  const isIndexReady = !!statistics && statistics.total_vectors > 0;

  // Auto-load persisted index stats when the page mounts
  useEffect(() => {
    if (repoName) {
      loadStats(repoName);
    }
  }, [repoName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MainLayout>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-center gap-4 px-5 py-3.5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md shrink-0">
          <button
            onClick={() => navigate(repoMeta ? "/embeddings" : "/", { state: { repoMeta } })}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/30 text-sm">
              🗄️
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white">Vector Database</h1>
              {repoMeta && (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {repoMeta.owner}/{repoMeta.repository_name} · FAISS
                </p>
              )}
            </div>
          </div>

          {/* Nav links */}
          {repoMeta && (
            <div className="hidden sm:flex items-center gap-2">
              {[
                { label: "⚡ Chunks", path: "/chunks" },
                { label: "🧠 Embeddings", path: "/embeddings" },
              ].map(({ label, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(path, { state: { repoMeta } })}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-cyan-500/30"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <span className="hidden sm:block text-[9px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full px-2.5 py-1 font-semibold uppercase tracking-widest shrink-0">
            Phase 6
          </span>
        </header>

        {/* ── Body ────────────────────────────────────────────────── */}
        {!repoMeta ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-teal-600/10 border border-cyan-500/10 flex items-center justify-center">
              <span className="text-3xl">🗄️</span>
            </div>
            <div>
              <p className="text-slate-300 font-medium">No Repository Loaded</p>
              <p className="text-slate-600 text-sm mt-1">Clone and embed a repository first.</p>
            </div>
            <button onClick={() => navigate("/")} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 hover:text-white transition-all">
              Go to Home →
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">

              {/* Errors */}
              {(buildError || statsError) && (
                <ErrorNotification message={buildError || statsError} onDismiss={clearErrors} />
              )}

              {/* ── Control panel ────────────────────────── */}
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-white font-bold">P6</span>
                      </div>
                      <h2 className="text-sm font-semibold text-white">FAISS Index Builder</h2>
                      {isIndexReady && (
                        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-medium">
                          ✓ Index Ready
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {repoMeta.owner}/{repoMeta.repository_name} · IndexFlatIP (cosine similarity)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isIndexReady && (
                      <button
                        id="delete-vector-index-btn"
                        onClick={() => triggerDelete(repoName)}
                        className="text-[11px] text-red-400/60 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-lg px-3 py-2 transition-colors"
                      >
                        🗑 Delete Index
                      </button>
                    )}
                    <button
                      id="build-vector-index-btn"
                      onClick={() => triggerBuild(repoName)}
                      disabled={isBuilding}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-teal-500 active:scale-95 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {isBuilding ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Building…</>
                      ) : (
                        <>🗄️ {isIndexReady ? "Rebuild Index" : "Build Index"}</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Build result pills */}
                {buildResult && !isBuilding && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-cyan-500/10 border-cyan-500/20 text-cyan-300">
                      {fmt(buildResult.total_vectors)} Vectors
                    </span>
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-teal-500/10 border-teal-500/20 text-teal-300">
                      Dim: {buildResult.embedding_dimension}
                    </span>
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-white/5 border-white/10 text-slate-400">
                      {buildResult.elapsed_seconds}s
                    </span>
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-white/5 border-white/10 text-slate-500 font-mono">
                      {buildResult.index_type}
                    </span>
                  </div>
                )}
              </div>

              {/* ── FAISS status + stat cards ─────────────── */}
              <FaissStatusCard statistics={statistics} isReady={isIndexReady} />

              {statistics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon="📊" label="Total Vectors" value={fmt(statistics.total_vectors)} accent="text-cyan-400" />
                  <StatCard icon="📐" label="Dimension" value={statistics.embedding_dimension} accent="text-teal-400" sub="float32 · L2 norm" />
                  <StatCard icon="💾" label="Index Size" value={`${(statistics.index_size_bytes / 1024).toFixed(1)} KB`} accent="text-sky-400" />
                  <StatCard icon="🏷️" label="Index Type" value={statistics.index_type} accent="text-indigo-400" sub="Cosine similarity" />
                </div>
              )}

              {/* ── Search tester ─────────────────────────── */}
              <SearchPanel
                repoName={repoName}
                isSearching={isSearching}
                searchResults={searchResults}
                searchError={searchError}
                onSearch={triggerSearch}
                onClear={clearResults}
              />

              {/* ── Empty state ───────────────────────────── */}
              {!isIndexReady && !isBuilding && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center select-none">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-teal-600/10 border border-cyan-500/10 flex items-center justify-center">
                    <span className="text-4xl">🗄️</span>
                  </div>
                  <div>
                    <p className="text-slate-300 font-semibold">Vector Index Not Built</p>
                    <p className="text-slate-600 text-sm mt-1 max-w-sm">
                      Click <strong className="text-white">Build Index</strong> to create a FAISS index from your repository embeddings.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {["✓ Clone (P2)", "✓ Parse (P3)", "✓ Chunk (P4)", "✓ Embed (P5)", "→ FAISS (P6)"].map((step) => (
                      <span key={step} className="text-[11px] border border-white/10 rounded-full px-3 py-1 text-slate-500">
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
