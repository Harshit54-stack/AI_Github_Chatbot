import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import { useEmbedder } from "../hooks/useEmbedder";

// ── Chunk-type colour map (consistent with ChunkExplorerPage) ────────────────
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
  "C++":         "text-pink-300 bg-pink-500/10 border-pink-500/20",
  Go:            "text-teal-300 bg-teal-500/10 border-teal-500/20",
  Rust:          "text-orange-200 bg-orange-400/10 border-orange-400/20",
  Markdown:      "text-amber-300 bg-amber-500/10 border-amber-500/20",
};

// ── Helper components ────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent = "text-indigo-400", sub }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 text-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold tabular-nums truncate ${accent}`}>
          {value ?? "—"}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LangBadge({ language }) {
  const color = LANG_COLORS[language] || "text-slate-400 bg-slate-500/10 border-slate-500/20";
  return (
    <span className={`text-[9px] border rounded px-1.5 py-0.5 font-mono ${color}`}>
      {language}
    </span>
  );
}

function TypeBadge({ type }) {
  const meta = CHUNK_TYPE_META[type] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] border rounded px-1.5 py-0.5 font-medium ${meta.color}`}>
      {meta.icon} {type.replace("_", " ")}
    </span>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, isGenerating }) {
  if (!progress && !isGenerating) return null;

  const pct = progress
    ? Math.min(100, Math.round((progress.processed_chunks / Math.max(progress.total_chunks, 1)) * 100))
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-400">
          {progress?.is_complete
            ? "Generation complete ✓"
            : `Processing chunks… ${progress?.processed_chunks ?? 0} / ${progress?.total_chunks ?? "?"}`}
        </span>
        <span className="text-[11px] text-indigo-400 font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            progress?.is_complete
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-indigo-500 to-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress && (
        <div className="flex gap-4 text-[10px] text-slate-600">
          <span>⚡ {progress.cache_hits} cached</span>
          {progress.failed_chunks > 0 && (
            <span className="text-red-500">✗ {progress.failed_chunks} failed</span>
          )}
          <span className="ml-auto tabular-nums">{progress.elapsed_seconds}s</span>
        </div>
      )}
    </div>
  );
}

// ── Model info card ───────────────────────────────────────────────────────────

function ModelCard({ statistics }) {
  return (
    <div className="bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
          <span className="text-2xl">🧠</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-bold text-white">Embedding Model</h3>
            {statistics && (
              <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-medium">
                ✓ Active
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-indigo-300 truncate">
            {statistics?.model_name ?? "BAAI/bge-base-en-v1.5"}
          </p>
          {statistics && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
              <span>Dim: <span className="text-slate-300 font-mono">{statistics.embedding_dimension}</span></span>
              <span>·</span>
              <span>Time: <span className="text-slate-300 font-mono">{statistics.elapsed_seconds}s</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Embedding list table ──────────────────────────────────────────────────────

function EmbeddingTable({ embeddings }) {
  const [filter, setFilter] = useState("");
  const term = filter.toLowerCase();
  const shown = term
    ? embeddings.filter(
        (e) =>
          e.file_path.toLowerCase().includes(term) ||
          e.chunk_type.toLowerCase().includes(term) ||
          e.language.toLowerCase().includes(term)
      )
    : embeddings;

  if (embeddings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <span className="text-2xl opacity-40">🧠</span>
        <p className="text-slate-600 text-xs">No embeddings generated yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search bar */}
      <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            id="embedding-search"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by file, type, or language…"
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Count */}
      <div className="px-4 py-1.5 border-b border-white/5 shrink-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
          Embeddings <span className="text-slate-600 ml-1">({shown.length.toLocaleString()})</span>
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {shown.map((emb) => (
          <div
            key={emb.embedding_id}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-mono text-slate-300 truncate">{emb.file_path}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <TypeBadge type={emb.chunk_type} />
                <LangBadge language={emb.language} />
                {emb.was_cached && (
                  <span className="text-[9px] text-emerald-500/70">⚡ cached</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] text-slate-600 font-mono">{emb.embedding_dimension}d</p>
              <p className="text-[9px] text-slate-700 font-mono truncate max-w-[80px]">
                {emb.embedding_id}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Distribution donut cards ──────────────────────────────────────────────────

function DistributionCard({ title, data }) {
  if (!data || Object.keys(data).length === 0) return null;
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">{title}</p>
      <div className="space-y-2">
        {Object.entries(data)
          .sort(([, a], [, b]) => b - a)
          .map(([key, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const meta = CHUNK_TYPE_META[key] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span>{meta.icon}</span>
                    <span className="capitalize">{key.replace("_", " ")}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 tabular-nums">{count.toLocaleString()} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500/60 to-violet-500/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Main EmbeddingsDashboard ──────────────────────────────────────────────────

/**
 * EmbeddingsDashboard — Phase 5 UI.
 * Route: /embeddings
 */
export default function EmbeddingsDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const repoMeta = location.state?.repoMeta ?? null;

  const {
    statistics,
    embeddings,
    totalEmbeddings,
    progress,
    result,
    isGenerating,
    statsError,
    generateError,
    triggerGenerate,
    triggerRegenerate,
    clearErrors,
  } = useEmbedder();

  const repoName = repoMeta?.repository_name ?? "";
  const isComplete = !!statistics;
  const cacheHitPct = statistics
    ? Math.round(statistics.cache_hit_ratio * 100)
    : null;

  return (
    <MainLayout>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-center gap-4 px-5 py-3.5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md shrink-0">
          <button
            onClick={() => navigate(repoMeta ? "/chunks" : "/", { state: { repoMeta } })}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30 text-sm">
              🧠
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white">Embeddings Dashboard</h1>
              {repoMeta && (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {repoMeta.owner}/{repoMeta.repository_name}
                </p>
              )}
            </div>
          </div>

          {/* Nav pills */}
          {repoMeta && (
            <div className="hidden sm:flex items-center gap-2">
              {[
                { label: "🌳 Explorer", path: "/explorer" },
                { label: "⚡ Chunks", path: "/chunks" },
              ].map(({ label, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(path, { state: { repoMeta } })}
                  className="text-[11px] text-slate-400 hover:text-violet-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <span className="hidden sm:block text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full px-2.5 py-1 font-semibold uppercase tracking-widest shrink-0">
            Phase 5
          </span>
        </header>

        {/* ── Body ────────────────────────────────────────────────── */}
        {!repoMeta ? (
          /* No repo state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-600/10 border border-indigo-500/10 flex items-center justify-center">
              <span className="text-3xl">🧠</span>
            </div>
            <div>
              <p className="text-slate-300 font-medium">No Repository Loaded</p>
              <p className="text-slate-600 text-sm mt-1">Clone and chunk a repository first.</p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 hover:text-white transition-all"
            >
              Go to Home →
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">

              {/* ── Error notifications ──────────────── */}
              {(generateError || statsError) && (
                <ErrorNotification
                  message={generateError || statsError}
                  onDismiss={clearErrors}
                />
              )}

              {/* ── Control panel ────────────────────── */}
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-white font-bold">P5</span>
                      </div>
                      <h2 className="text-sm font-semibold text-white">Embedding Generator</h2>
                      {isComplete && (
                        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-medium">
                          ✓ Generated
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {repoMeta.owner}/{repoMeta.repository_name} · BAAI/bge-base-en-v1.5
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      id="regenerate-embeddings-btn"
                      onClick={() => triggerRegenerate(repoName)}
                      disabled={isGenerating || !isComplete}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 border border-white/10 hover:border-violet-500/30 hover:text-violet-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>🔄</span>
                      Regenerate Changed
                    </button>
                    <button
                      id="generate-embeddings-btn"
                      onClick={() => triggerGenerate(repoName)}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {isGenerating ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>🧠 {isComplete ? "Re-Generate All" : "Generate Embeddings"}</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {(isGenerating || progress) && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <ProgressBar progress={progress} isGenerating={isGenerating} />
                  </div>
                )}

                {/* Result summary pills */}
                {result && !isGenerating && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-indigo-500/10 border-indigo-500/20 text-indigo-300">
                      {result.total_embeddings.toLocaleString()} Total
                    </span>
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                      ⚡ {result.cache_hits.toLocaleString()} Cached
                    </span>
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-violet-500/10 border-violet-500/20 text-violet-300">
                      ✨ {result.new_embeddings.toLocaleString()} New
                    </span>
                    {result.failed_chunks > 0 && (
                      <span className="text-[11px] border rounded-full px-3 py-1 bg-red-500/10 border-red-500/20 text-red-300">
                        ✗ {result.failed_chunks} Failed
                      </span>
                    )}
                    <span className="text-[11px] border rounded-full px-3 py-1 bg-white/5 border-white/10 text-slate-400">
                      {result.elapsed_seconds}s
                    </span>
                  </div>
                )}
              </div>

              {/* ── Model card ────────────────────────── */}
              <ModelCard statistics={statistics} />

              {/* ── Stat cards grid ───────────────────── */}
              {statistics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    icon="🧠"
                    label="Total Embeddings"
                    value={statistics.total_embeddings.toLocaleString()}
                    accent="text-indigo-400"
                  />
                  <StatCard
                    icon="📐"
                    label="Embedding Dimension"
                    value={statistics.embedding_dimension}
                    accent="text-violet-400"
                    sub="float32 · L2 normalised"
                  />
                  <StatCard
                    icon="⚡"
                    label="Cache Hit Ratio"
                    value={`${cacheHitPct}%`}
                    accent={cacheHitPct > 50 ? "text-emerald-400" : "text-amber-400"}
                    sub={`${statistics.cache_hits.toLocaleString()} hits`}
                  />
                  <StatCard
                    icon="⏱️"
                    label="Generation Time"
                    value={`${statistics.elapsed_seconds}s`}
                    accent="text-sky-400"
                  />
                </div>
              )}

              {/* ── Charts + table ────────────────────── */}
              {statistics && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Distribution charts */}
                  <div className="space-y-4">
                    <DistributionCard
                      title="Chunk Type Distribution"
                      data={statistics.chunk_type_distribution}
                    />
                    {/* Languages list */}
                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">Languages</p>
                      <div className="flex flex-wrap gap-1.5">
                        {statistics.languages.map((lang) => (
                          <LangBadge key={lang} language={lang} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Embedding metadata table */}
                  <div className="lg:col-span-2 bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "400px" }}>
                    <div className="px-4 py-3 border-b border-white/5 shrink-0">
                      <p className="text-[11px] font-semibold text-slate-300">
                        Embedding Records
                        <span className="text-slate-600 ml-1.5 font-normal">
                          (no vectors exposed)
                        </span>
                      </p>
                    </div>
                    <div className="flex-1 min-h-0">
                      <EmbeddingTable embeddings={embeddings} />
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state when not yet generated */}
              {!statistics && !isGenerating && (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center select-none">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-violet-600/10 border border-indigo-500/10 flex items-center justify-center">
                    <span className="text-4xl">🧠</span>
                  </div>
                  <div>
                    <p className="text-slate-300 font-semibold">No Embeddings Yet</p>
                    <p className="text-slate-600 text-sm mt-1 max-w-sm">
                      Click <strong className="text-white">Generate Embeddings</strong> above to create
                      semantic vectors from your repository chunks.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {["✓ Clone repo", "✓ Parse (P3)", "✓ Chunk (P4)", "→ Embed (P5)"].map((step) => (
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
