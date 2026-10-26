import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  cloneRepository,
  parseRepository,
  generateChunks,
  generateEmbeddings,
  buildVectorIndex,
} from "../services/api";

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [cloneError, setCloneError] = useState(null);
  const navigate = useNavigate();

  const handleAnalyze = async () => {
    const trimmed = repoUrl.trim();
    if (!trimmed || isCloning) return;

    setIsCloning(true);
    setCloneError(null);
    setStatusMessage("Cloning repository…");

    try {
      // 1. Clone
      const meta = await cloneRepository(trimmed);
      const repoName = meta.repository_name;

      // 2. Parse
      setStatusMessage("Parsing code files (Tree-sitter)…");
      await parseRepository(repoName);

      // 3. Chunk
      setStatusMessage("Generating semantic chunks…");
      await generateChunks(repoName);

      // 4. Embed
      setStatusMessage("Generating vector embeddings (BGE)…");
      await generateEmbeddings(repoName);

      // 5. Build FAISS
      setStatusMessage("Building FAISS vector index…");
      await buildVectorIndex(repoName);

      setStatusMessage("Done!");
      navigate("/chat", { state: { repoMeta: meta } });
    } catch (err) {
      let detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error;

      if (!detail) {
        if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
          detail =
            "Request timed out — the server is still processing. Please wait a moment and try again, or use a smaller repository.";
        } else {
          detail = "Analysis failed. Please check your repository URL and try again.";
        }
      }
      setCloneError(detail);
    } finally {
      setIsCloning(false);
      setStatusMessage("");
    }
  };

  return (
    <MainLayout>
      {/* ── Full-screen cloning overlay ─────────────────────────── */}
      {isCloning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/40 animate-pulse">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{statusMessage || "Analyzing Repository…"}</p>
              <p className="text-slate-400 text-sm mt-1">This may take a moment for large repos</p>
            </div>
            <LoadingSpinner />
            <p className="text-slate-600 text-xs font-mono break-all max-w-xs">{repoUrl}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
        {/* ── Logo ───────────────────────────────────────────────── */}
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-violet-500/40">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 opacity-30 blur-xl scale-125" />
        </div>

        {/* ── Title ──────────────────────────────────────────────── */}
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center leading-tight tracking-tight mb-3">
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">
            AI GitHub
          </span>
          <br />
          <span className="text-white">Repository Assistant</span>
        </h1>

        {/* ── Subtitle ───────────────────────────────────────────── */}
        <p className="text-slate-400 text-center max-w-md text-base leading-relaxed mb-12">
          Paste any public GitHub repository URL to clone it, parse its structure with Tree-sitter,
          and chat with the codebase using the power of Google Gemini AI.
        </p>

        {/* ── Error notification ─────────────────────────────────── */}
        {cloneError && (
          <div className="w-full max-w-xl mb-4">
            <ErrorNotification message={cloneError} onDismiss={() => setCloneError(null)} />
          </div>
        )}

        {/* ── Input card ─────────────────────────────────────────── */}
        <div className="w-full max-w-xl bg-white/[0.04] border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
          <label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">
            GitHub Repository URL
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="repo-url-input"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="https://github.com/owner/repository"
              disabled={isCloning}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-50"
            />
            <button
              id="analyze-btn"
              onClick={handleAnalyze}
              disabled={isCloning || !repoUrl.trim()}
              className="sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm hover:from-violet-500 hover:to-indigo-500 active:scale-95 transition-all shadow-lg shadow-violet-500/30 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isCloning ? "Cloning…" : "Analyze →"}
            </button>
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            ⚡ Phase 5 — Embedding Generation is live. Clone → Parse → Chunk → Embed!
          </p>
        </div>

        {/* ── Feature badges ─────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 justify-center mt-10">
          {[
            "🤖 Gemini AI",
            "⚡ FastAPI Backend",
            "📦 Repository Loader ✓",
            "🌳 Tree-sitter Parser ✓",
            "🔍 Code Explorer ✓",
            "⚡ Code Chunking ✓",
            "🧠 Embeddings ✓",
            "🗄️ FAISS (Phase 6)",
          ].map((badge) => (
            <span
              key={badge}
              className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-slate-400"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
