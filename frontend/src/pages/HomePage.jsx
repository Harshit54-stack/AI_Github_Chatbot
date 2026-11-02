import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ErrorNotification from "../components/ErrorNotification";
import LoadingSpinner from "../components/LoadingSpinner";
import UserMenu from "../components/UserMenu";
import { useAuth } from "../context/AuthContext";
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
  const { user, isLoading: authLoading } = useAuth();
  const { repoMeta, setRepoMeta } = useChat();

  const hasValidRepo = isValidRepoMeta(repoMeta);

  const handleAnalyze = async () => {
    const trimmed = repoUrl.trim();
    if (!trimmed || isCloning) return;

    // If not authenticated, redirect to login
    if (!user) {
      navigate("/login");
      return;
    }

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

  const handleLogin = () => navigate("/login");
  const handleSignup = () => navigate("/login");

  /* ── Quick-start cards ─────────────────────────────────────── */
  const quickStartCards = [
    {
      title: "Understand Code",
      description: "Understand functions, classes, and project architecture.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
      ),
    },
    {
      title: "Find Code",
      description: "Locate relevant files and explore implementation details.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      ),
    },
    {
      title: "Ask Questions",
      description: "Ask questions about your repository using AI-powered retrieval.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
    },
  ];

  /* ── Feature / capability cards ────────────────────────────── */
  const featureCards = [
    {
      title: "Repository Explorer",
      description: "Browse files and inspect source code.",
      path: "/explorer",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
        </svg>
      ),
    },
    {
      title: "Code Chunking",
      description: "Explore code segments prepared for retrieval.",
      path: "/chunks",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      ),
    },
    {
      title: "Embeddings",
      description: "Inspect generated semantic representations.",
      path: "/embeddings",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      ),
    },
    {
      title: "Vector Search",
      description: "Retrieve relevant code using semantic similarity.",
      path: "/vector",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
    },
    {
      title: "AI Chat",
      description: "Ask questions about repository implementation.",
      path: "/chat",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
    },
    {
      title: "Code Understanding",
      description: "Understand architecture, functions, and relationships.",
      path: "/chat",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      ),
    },
  ];

  const handleQuickStartClick = () => {
    const inputEl = document.getElementById("repo-url-input");
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
      inputEl.focus();
    }
  };

  const handleFeatureClick = (path) => {
    if (!user) {
      navigate("/login");
      return;
    }
    navigate(path, { state: { repoMeta } });
  };

  return (
    <MainLayout>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="landing-header">
        <div className="flex items-center gap-3">
          {/* Small app icon */}
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center cursor-pointer shrink-0"
            onClick={() => navigate("/")}
            title="Home"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Active repo quick-access (if authenticated and has repo) */}
          {user && hasValidRepo && (
            <button
              onClick={() => navigate("/chat", { state: { repoMeta } })}
              className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#A1A1B2] hover:text-white bg-[#13141C] border border-[rgba(255,255,255,0.09)] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition-all"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">{repoMeta.repository_name}</span>
            </button>
          )}

          {/* Auth section */}
          {authLoading ? (
            <div className="w-6 h-6 rounded-full border-2 border-violet-500/40 border-t-transparent animate-spin" />
          ) : user ? (
            <UserMenu dropdownPosition="down" />
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogin}
                className="landing-btn-ghost"
              >
                Log in
              </button>
              <button
                onClick={handleSignup}
                className="landing-btn-primary"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Full-Screen Loading Overlay ──────────────────────────── */}
      {isCloning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090A0F]/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-5 text-center px-8 max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-600/40 animate-pulse">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{statusMessage || "Analyzing Repository…"}</p>
              <p className="text-[#77798D] text-xs mt-1.5">
                Parsing AST, generating semantic chunks, and building FAISS vector index
              </p>
            </div>
            <LoadingSpinner />
            <p className="text-[#77798D] text-xs font-mono break-all bg-black/40 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.06)]">
              {repoUrl}
            </p>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="landing-main">

        {/* ── Hero Section ─────────────────────────────────────── */}
        <section className="landing-hero">
          <h1 className="landing-heading">
            GitHub <span className="text-violet-400">Chatbot</span>
          </h1>

          {/* Error Banner */}
          {cloneError && (
            <div className="w-full max-w-2xl mt-2">
              <ErrorNotification message={cloneError} onDismiss={() => setCloneError(null)} />
            </div>
          )}

          {/* ── Repository Input ──────────────────────────────── */}
          <div className="landing-input-container">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch">
              <div className="relative flex-1">
                {/* GitHub icon */}
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#77798D]">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
                  </svg>
                </span>
                <input
                  id="repo-url-input"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="Paste a GitHub repository URL..."
                  disabled={isCloning}
                  className="landing-input"
                />
              </div>
              <button
                id="analyze-btn"
                onClick={handleAnalyze}
                disabled={isCloning || !repoUrl.trim()}
                className="landing-btn-analyze"
              >
                {isCloning ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <span>Analyze Repository</span>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* ── Active Repository Snapshot ───────────────────────── */}
        {user && hasValidRepo && (
          <section className="landing-active-repo">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[11px] text-[#77798D] tracking-wide font-medium">
                  Currently loaded
                </p>
                <h3 className="text-base font-semibold text-white font-mono mt-0.5">
                  {repoMeta.owner} / {repoMeta.repository_name}
                </h3>
              </div>
              <button
                onClick={() => navigate("/chat", { state: { repoMeta } })}
                className="landing-btn-analyze !py-2 !px-4 !text-xs"
              >
                Continue Chatting →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
              {[
                { label: "Branch", value: repoMeta.branch || "HEAD", color: "text-emerald-400" },
                { label: "Files", value: repoMeta.total_files?.toLocaleString() ?? 0, color: "text-white" },
                { label: "Supported", value: repoMeta.supported_files?.toLocaleString() ?? 0, color: "text-violet-300" },
                { label: "Languages", value: repoMeta.languages?.length ?? 0, color: "text-cyan-300" },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#171821] border border-[rgba(255,255,255,0.06)] rounded-lg p-3 text-center">
                  <span className="text-[10px] text-[#77798D] tracking-wide block">{stat.label}</span>
                  <span className={`text-sm font-bold ${stat.color} font-mono mt-0.5 block`}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Quick Start ──────────────────────────────────────── */}
        <section className="landing-section">
          <p className="text-sm text-[#A1A1B2] text-center mb-5">Explore your codebase</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {quickStartCards.map((card) => (
              <button
                key={card.title}
                onClick={handleQuickStartClick}
                className="landing-quickstart-card group"
              >
                <div className="landing-icon-disc text-[#A1A1B2] group-hover:text-violet-400 transition-colors">
                  {card.icon}
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-[#F5F5F7] group-hover:text-white transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-[#77798D] mt-1 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Capabilities Section ─────────────────────────────── */}
        <section className="landing-section">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F7] tracking-tight">
              Everything you need to understand a codebase
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featureCards.map((card) => (
              <div
                key={card.title}
                onClick={() => handleFeatureClick(card.path)}
                className="landing-feature-card group"
              >
                <div className="landing-icon-disc text-[#A1A1B2] group-hover:text-violet-400 transition-colors">
                  {card.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F7] group-hover:text-white transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-[#77798D] mt-1 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#77798D]">
          <span>GitHub Chatbot — AI-powered codebase intelligence</span>
          <span className="font-mono text-[11px]">React · FastAPI · Gemini · FAISS</span>
        </div>
      </footer>
    </MainLayout>
  );
}
