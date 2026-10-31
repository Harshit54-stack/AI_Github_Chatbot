import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import LoadingSpinner from "../components/LoadingSpinner";
import UserMenu from "../components/UserMenu";
import { useChat, isValidRepoMeta } from "../context/ChatContext";
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
  const { repoMeta, setRepoMeta } = useChat();

  const hasValidRepo = isValidRepoMeta(repoMeta);

  const handleAnalyze = async () => {
    const trimmed = repoUrl.trim();
    if (!trimmed || isCloning) return;

    setIsCloning(true);
    setCloneError(null);
    setStatusMessage("Cloning repository…");

    try {
      // 1. Clone
      const meta = await cloneRepository(trimmed);
      setRepoMeta(meta);
      const repoName = meta.repository_name;

      // 2. Parse
      setStatusMessage("Parsing code structure with Tree-sitter…");
      await parseRepository(repoName);

      // 3. Chunk
      setStatusMessage("Generating semantic AST chunks…");
      await generateChunks(repoName);

      // 4. Embed
      setStatusMessage("Generating vector embeddings (BGE)…");
      await generateEmbeddings(repoName);

      // 5. Build FAISS
      setStatusMessage("Indexing vectors in FAISS database…");
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

  const featureCards = [
    {
      title: "Repository Explorer",
      description: "Navigate your repository and inspect source files with Tree-sitter AST analysis.",
      path: "/explorer",
      icon: (
        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
        </svg>
      ),
      glowClass: "glow-card-cyan",
      linkText: "Explore Files",
    },
    {
      title: "Code Chunking",
      description: "Explore how source code is divided into searchable semantic chunks by functions and classes.",
      path: "/chunks",
      icon: (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      ),
      glowClass: "glow-card-amber",
      linkText: "Inspect Chunks",
    },
    {
      title: "Embeddings",
      description: "Inspect dense 768-dimensional vector representations generated from your codebase.",
      path: "/embeddings",
      icon: (
        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      ),
      glowClass: "glow-card-blue",
      linkText: "View Embeddings",
    },
    {
      title: "Vector Database",
      description: "Explore indexed vectors, index metrics, and test semantic retrieval against FAISS directly.",
      path: "/vector",
      icon: (
        <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
      glowClass: "glow-card-emerald",
      linkText: "Query Index",
    },
    {
      title: "AI Chat",
      description: "Ask questions about your codebase using retrieved context and Gemini-powered RAG streaming.",
      path: "/chat",
      icon: (
        <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
      glowClass: "glow-card-violet",
      linkText: "Open Chat",
    },
  ];

  return (
    <MainLayout>
      {/* ── Top Header Navigation ────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#0D0E14]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-600/30 ring-1 ring-white/10">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-white block">
              AI GITHUB ASSISTANT
            </span>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">
              Autonomous Codebase Intelligence
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasValidRepo && (
            <button
              onClick={() => navigate("/chat", { state: { repoMeta } })}
              className="text-xs font-medium text-slate-300 hover:text-white bg-white/5 border border-white/10 hover:border-violet-500/30 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">{repoMeta.repository_name}</span>
            </button>
          )}
          <UserMenu dropdownPosition="down" />
        </div>
      </header>

      {/* ── Full-Screen Loading Overlay ──────────────────────── */}
      {isCloning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#08090D]/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-5 text-center px-8 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-600/40 animate-pulse ring-1 ring-white/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{statusMessage || "Analyzing Repository…"}</p>
              <p className="text-slate-400 text-xs mt-1">
                Parsing AST, generating semantic chunks, and building FAISS vector index
              </p>
            </div>
            <LoadingSpinner />
            <p className="text-slate-500 text-xs font-mono break-all bg-black/40 px-3 py-1 rounded-lg border border-white/5">
              {repoUrl}
            </p>
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span>Next-Gen Codebase Intelligence</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-2xl leading-[1.1]">
            Your codebase,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
              understood.
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl leading-relaxed">
            Clone, analyze, and query any public GitHub repository. Grounded in AST syntax trees, semantic embeddings, and high-performance vector search.
          </p>

          {/* Error Banner */}
          {cloneError && (
            <div className="w-full max-w-xl pt-2">
              <ErrorNotification message={cloneError} onDismiss={() => setCloneError(null)} />
            </div>
          )}

          {/* Ingestion Composer Card */}
          <div className="w-full max-w-2xl bg-[#14151D] border border-white/[0.08] hover:border-violet-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl transition-all mt-4 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500/50">
            <label className="block text-[11px] text-slate-400 uppercase tracking-widest mb-2 font-medium text-left">
              GitHub Repository URL
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </span>
                <input
                  id="repo-url-input"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="https://github.com/owner/repository"
                  disabled={isCloning}
                  className="w-full bg-[#191A23] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500/60 transition-all disabled:opacity-50"
                />
              </div>
              <button
                id="analyze-btn"
                onClick={handleAnalyze}
                disabled={isCloning || !repoUrl.trim()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm hover:from-violet-500 hover:to-indigo-500 active:scale-95 transition-all shadow-lg shadow-violet-600/25 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {isCloning ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <span>Analyze Repository</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2.5 text-left">
              Automated end-to-end pipeline: Clone → Tree-sitter AST → Chunks → BGE Embeddings → FAISS Vector Store.
            </p>
          </div>
        </div>

        {/* ── Section: Premium Feature Cards (References 2 & 3) ── */}
        <section className="space-y-6">
          <div className="text-center sm:text-left">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Developer Capabilities
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Purpose-built tools for full repository inspection and semantic reasoning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {featureCards.map((card) => (
              <div
                key={card.title}
                onClick={() => navigate(card.path, { state: { repoMeta } })}
                className={`glow-card ${card.glowClass} p-6 flex flex-col justify-between cursor-pointer group`}
              >
                <div className="space-y-4">
                  {/* Icon Disc inspired by reference images */}
                  <div className="icon-disc group-hover:scale-105 transition-transform">
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-violet-200 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="pt-6 flex items-center gap-1.5 text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  <span>{card.linkText}</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Active Repository Snapshot ───────────────────────── */}
        {hasValidRepo && (
          <section className="bg-[#14151D] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">
                  Currently Loaded
                </p>
                <h3 className="text-lg font-bold text-white font-mono mt-0.5">
                  {repoMeta.owner} / {repoMeta.repository_name}
                </h3>
              </div>
              <button
                onClick={() => navigate("/chat", { state: { repoMeta } })}
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Continue Chatting →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-[#191A23] border border-white/[0.06] rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Branch</span>
                <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
                  {repoMeta.branch || "HEAD"}
                </span>
              </div>
              <div className="bg-[#191A23] border border-white/[0.06] rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Files</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                  {repoMeta.total_files?.toLocaleString() ?? 0}
                </span>
              </div>
              <div className="bg-[#191A23] border border-white/[0.06] rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Supported</span>
                <span className="text-sm font-bold text-violet-300 font-mono mt-0.5 block">
                  {repoMeta.supported_files?.toLocaleString() ?? 0}
                </span>
              </div>
              <div className="bg-[#191A23] border border-white/[0.06] rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Languages</span>
                <span className="text-sm font-bold text-cyan-300 font-mono mt-0.5 block">
                  {repoMeta.languages?.length ?? 0}
                </span>
              </div>
            </div>
          </section>
        )}
      </main>
    </MainLayout>
  );
}
