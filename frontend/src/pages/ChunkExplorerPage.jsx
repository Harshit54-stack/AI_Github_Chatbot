import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import { useChunker } from "../hooks/useChunker";

// ── Constants ────────────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  { value: "", label: "All Types" },
  { value: "function", label: "Function" },
  { value: "class", label: "Class" },
  { value: "method", label: "Method" },
  { value: "module", label: "Module" },
  { value: "readme", label: "README" },
  { value: "markdown_section", label: "Markdown Section" },
];

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
  C:             "text-gray-300 bg-gray-500/10 border-gray-500/20",
  Go:            "text-teal-300 bg-teal-500/10 border-teal-500/20",
  Rust:          "text-orange-200 bg-orange-400/10 border-orange-400/20",
  Markdown:      "text-amber-300 bg-amber-500/10 border-amber-500/20",
};

// ── Helper components ────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent = "text-violet-400" }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <span className="text-xl shrink-0">{icon}</span>
      <div>
        <p className={`text-xl font-bold tabular-nums ${accent}`}>
          {typeof value === "number" ? value.toLocaleString() : value ?? "—"}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function ChunkTypeBadge({ type, size = "normal" }) {
  const meta = CHUNK_TYPE_META[type] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
  const textSize = size === "small" ? "text-[9px]" : "text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 font-medium ${meta.color} ${textSize}`}>
      <span>{meta.icon}</span>
      <span className="capitalize">{type.replace("_", " ")}</span>
    </span>
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

// ── Generate Panel ───────────────────────────────────────────────────────────

function GeneratePanel({ repoMeta, isGenerating, generateSummary, generateError, onGenerate, onDismiss }) {
  const isGenerated = !!generateSummary;
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <span className="text-[10px] text-white font-bold">P4</span>
            </div>
            <h2 className="text-sm font-semibold text-white">Code Chunker</h2>
            {isGenerated && (
              <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-medium">
                ✓ Chunked
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {repoMeta
              ? `${repoMeta.owner}/${repoMeta.repository_name} · Semantic chunk generation`
              : "Clone and parse a repository, then generate chunks."}
          </p>
        </div>

        <button
          id="generate-chunks-btn"
          onClick={() => onGenerate(repoMeta?.repository_name || "")}
          disabled={!repoMeta || isGenerating}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-sm font-semibold hover:from-amber-500 hover:to-orange-500 active:scale-95 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {isGenerating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating…
            </>
          ) : isGenerated ? (
            "Re-Generate"
          ) : (
            <>
              <span>⚡</span>
              Generate Chunks
            </>
          )}
        </button>
      </div>

      {generateError && (
        <div className="mt-3">
          <ErrorNotification message={generateError} onDismiss={onDismiss} />
        </div>
      )}

      {generateSummary && !generateError && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[11px] border rounded-full px-3 py-1 font-medium bg-amber-500/10 border-amber-500/20 text-amber-300">
            {generateSummary.total_chunks.toLocaleString()} Chunks
          </span>
          {Object.entries(generateSummary.chunk_type_distribution || {}).map(([type, count]) => (
            <span key={type} className="text-[11px] border rounded-full px-3 py-1 font-medium bg-white/5 border-white/10 text-slate-300">
              {count} {type.replace("_", " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ languages, filters, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02] shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-[160px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
        <input
          id="chunk-search-input"
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search symbol or file…"
          className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
        />
      </div>

      {/* Language filter */}
      <select
        id="chunk-lang-filter"
        value={filters.language}
        onChange={(e) => onChange({ ...filters, language: e.target.value })}
        className="text-xs bg-white/5 border border-white/10 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 transition-colors cursor-pointer"
      >
        <option value="">All Languages</option>
        {languages.map((lang) => (
          <option key={lang} value={lang}>{lang}</option>
        ))}
      </select>

      {/* Chunk type filter */}
      <select
        id="chunk-type-filter"
        value={filters.chunk_type}
        onChange={(e) => onChange({ ...filters, chunk_type: e.target.value })}
        className="text-xs bg-white/5 border border-white/10 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 transition-colors cursor-pointer"
      >
        {CHUNK_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Chunk List Row ────────────────────────────────────────────────────────────

function ChunkRow({ chunk, isSelected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(chunk.chunk_id)}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group border ${
        isSelected
          ? "bg-amber-500/10 border-amber-500/25"
          : "hover:bg-white/5 border-transparent hover:border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <ChunkTypeBadge type={chunk.chunk_type} size="small" />
            <span className={`text-xs font-mono font-semibold truncate max-w-[180px] ${isSelected ? "text-amber-200" : "text-white group-hover:text-white"}`}>
              {chunk.symbol_name}
            </span>
            {chunk.parent_class && (
              <span className="text-[9px] text-slate-600">in {chunk.parent_class}</span>
            )}
          </div>
          <p className="text-[9px] text-slate-600 truncate font-mono">{chunk.file_path}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <LangBadge language={chunk.language} />
          <span className="text-[9px] text-slate-700 tabular-nums">
            L{chunk.start_line}–{chunk.end_line}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Chunk Detail Panel ────────────────────────────────────────────────────────

function ChunkDetail({ chunk, isLoading, error }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!chunk) return;
    navigator.clipboard.writeText(chunk.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500">Loading chunk…</p>
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

  if (!chunk) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 select-none px-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/10 flex items-center justify-center">
          <span className="text-2xl">⚡</span>
        </div>
        <div className="text-center">
          <p className="text-slate-400 font-medium text-sm">Select a chunk</p>
          <p className="text-slate-600 text-xs mt-1">
            Click any chunk from the list to inspect its source code and metadata.
          </p>
        </div>
      </div>
    );
  }

  const meta = CHUNK_TYPE_META[chunk.chunk_type] || { icon: "📄", color: "" };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 shrink-0 border-b border-white/5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <ChunkTypeBadge type={chunk.chunk_type} />
              <span className="text-base font-mono font-bold text-white">
                {chunk.symbol_name}
              </span>
            </div>
            {chunk.parent_class && (
              <p className="text-[11px] text-slate-500 mb-1">
                Method of <span className="text-violet-400 font-mono">{chunk.parent_class}</span>
              </p>
            )}
            <p className="text-[10px] text-slate-600 font-mono truncate">{chunk.file_path}</p>
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 text-[10px] border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-400 hover:text-white hover:border-white/20 transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Metadata pills */}
        <div className="flex flex-wrap gap-1.5">
          <LangBadge language={chunk.language} />
          <span className="text-[9px] border border-white/10 rounded px-1.5 py-0.5 text-slate-500 tabular-nums">
            L{chunk.start_line}–{chunk.end_line} ({chunk.total_lines} lines)
          </span>
          <span className="text-[9px] border border-white/10 rounded px-1.5 py-0.5 text-slate-600 font-mono">
            id: {chunk.chunk_id}
          </span>
        </div>

        {/* Docstring */}
        {chunk.docstring && (
          <p className="text-[11px] text-slate-400 italic leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
            "{chunk.docstring}"
          </p>
        )}

        {/* Imports (collapsed) */}
        {chunk.imports?.length > 0 && (
          <details className="group">
            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none list-none flex items-center gap-1">
              <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
              {chunk.imports.length} import{chunk.imports.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1">
              {chunk.imports.map((imp, i) => (
                <p key={i} className="text-[10px] font-mono text-slate-500 bg-white/[0.02] rounded px-2 py-1 truncate">
                  {imp}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Source code */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Line number gutter */}
          <pre className="px-0 py-4 text-[11px] font-mono leading-5 overflow-x-auto">
            <code>
              {chunk.content.split("\n").map((line, i) => (
                <div key={i} className="flex hover:bg-white/[0.03] transition-colors px-3">
                  <span className="text-slate-700 select-none w-8 shrink-0 text-right mr-4 tabular-nums">
                    {chunk.start_line + i}
                  </span>
                  <span className="text-slate-300 flex-1 min-w-0 break-all whitespace-pre-wrap">
                    {line || " "}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ── Main ChunkExplorerPage ────────────────────────────────────────────────────

/**
 * ChunkExplorerPage — Phase 4 Chunk Explorer.
 * Route: /chunks
 */
export default function ChunkExplorerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const repoMeta = location.state?.repoMeta ?? null;

  const {
    generateSummary,
    statistics,
    chunks,
    totalChunks,
    selectedChunk,
    isGenerating,
    isLoadingList,
    isLoadingChunk,
    generateError,
    listError,
    chunkError,
    triggerGenerate,
    applyFilters,
    selectChunk,
    clearErrors,
  } = useChunker();

  const [filters, setFilters] = useState({
    search: "",
    language: "",
    chunk_type: "",
  });

  // Debounce filter application
  useEffect(() => {
    const id = setTimeout(() => {
      if (generateSummary) {
        const active = {};
        if (filters.search) active.search = filters.search;
        if (filters.language) active.language = filters.language;
        if (filters.chunk_type) active.chunk_type = filters.chunk_type;
        applyFilters(active);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [filters, generateSummary, applyFilters]);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);

  const languages = statistics?.languages || [];

  return (
    <MainLayout>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────── */}
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
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
              <span className="text-sm">⚡</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">Chunk Explorer</h1>
              {repoMeta && (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {repoMeta.owner}/{repoMeta.repository_name}
                </p>
              )}
            </div>
          </div>

          {/* Navigation buttons */}
          {repoMeta && (
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => navigate("/explorer", { state: { repoMeta } })}
                className="text-[11px] text-slate-400 hover:text-violet-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30"
              >
                Explorer
              </button>
              <button
                onClick={() => navigate("/embeddings", { state: { repoMeta } })}
                className="text-[11px] text-slate-400 hover:text-indigo-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-indigo-500/30"
              >
                🧠 Embeddings
              </button>
              <button
                onClick={() => navigate("/chat", { state: { repoMeta } })}
                className="text-[11px] text-slate-400 hover:text-violet-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30"
              >
                Chat
              </button>
            </div>
          )}

          <span className="hidden sm:block text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full px-2.5 py-1 font-semibold uppercase tracking-widest shrink-0">
            Phase 4
          </span>
        </header>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Generate panel + stat cards */}
          <div className="px-5 pt-4 pb-3 space-y-3 shrink-0">
            <GeneratePanel
              repoMeta={repoMeta}
              isGenerating={isGenerating}
              generateSummary={generateSummary}
              generateError={generateError}
              onGenerate={triggerGenerate}
              onDismiss={clearErrors}
            />

            {/* Stats row */}
            {statistics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon="⚡" label="Total Chunks" value={statistics.total_chunks} accent="text-amber-400" />
                <StatCard icon="📏" label="Avg Lines" value={statistics.average_chunk_size} accent="text-orange-400" />
                <StatCard icon="⬆️" label="Largest Chunk" value={statistics.largest_chunk_lines} accent="text-rose-400" />
                <StatCard icon="🌐" label="Languages" value={statistics.languages?.length} accent="text-sky-400" />
              </div>
            )}
          </div>

          {/* Two-pane explorer */}
          {!repoMeta ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 select-none">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/10 flex items-center justify-center">
                <span className="text-3xl">⚡</span>
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
            <div className="flex-1 overflow-hidden flex min-h-0">

              {/* Left: Chunk list */}
              <div className="w-80 shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
                {/* Filter bar */}
                {generateSummary && (
                  <FilterBar
                    languages={languages}
                    filters={filters}
                    onChange={handleFilterChange}
                  />
                )}

                {/* Count bar */}
                <div className="px-4 py-2 border-b border-white/5 shrink-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                    Chunks
                    {generateSummary && (
                      <span className="ml-1.5 text-slate-600">
                        ({isLoadingList ? "…" : totalChunks.toLocaleString()})
                      </span>
                    )}
                  </p>
                </div>

                {listError && (
                  <p className="text-[11px] text-red-400 px-4 py-2">{listError}</p>
                )}

                {/* List body */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                  {!generateSummary ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                      <span className="text-xl">⚡</span>
                      <p className="text-[11px] text-slate-600 text-center px-4">
                        Generate chunks to browse them here.
                      </p>
                    </div>
                  ) : isLoadingList ? (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : chunks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                      <span className="text-xl">🔍</span>
                      <p className="text-[11px] text-slate-600 text-center px-4">
                        No chunks match the current filter.
                      </p>
                    </div>
                  ) : (
                    chunks.map((chunk) => (
                      <ChunkRow
                        key={chunk.chunk_id}
                        chunk={chunk}
                        isSelected={selectedChunk?.chunk_id === chunk.chunk_id}
                        onSelect={selectChunk}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Right: Chunk detail */}
              <div className="flex-1 overflow-hidden min-w-0">
                <ChunkDetail
                  chunk={selectedChunk}
                  isLoading={isLoadingChunk}
                  error={chunkError}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
