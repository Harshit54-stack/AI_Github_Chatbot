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

  const handleAnalyze = async (urlToAnalyze = repoUrl) => {
    const trimmed = (urlToAnalyze || "").trim();
    if (!trimmed || isCloning) return;

    // Basic URL validation
    if (!trimmed.includes("github.com/")) {
      setCloneError("Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repository).");
      return;
    }

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

  const focusRepoInput = () => {
    const inputEl = document.getElementById("repo-url-input");
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
      inputEl.focus();
    }
  };

  /* ── Quick Action Cards (Section 5) ───────────────────────── */
  const quickActionCards = [
    {
      title: "Understand Code",
      description: "Explore repository structure and understand how files are organized.",
      action: () => {
        if (hasValidRepo) {
          navigate("/explorer", { state: { repoMeta } });
        } else {
          focusRepoInput();
        }
      },
      badge: hasValidRepo ? "Open Explorer →" : "Paste repo to explore",
      icon: (
        // Lucide: FolderTree
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M3 5v14a2 2 0 0 0 2 2h3" />
          <path d="M3 12h5" />
        </svg>
      ),
    },
    {
      title: "Find Code",
      description: "Discover relevant code using semantic search and vector embeddings.",
      action: () => {
        if (hasValidRepo) {
          navigate("/vector", { state: { repoMeta } });
        } else {
          focusRepoInput();
        }
      },
      badge: hasValidRepo ? "Search Vectors →" : "Paste repo to search",
      icon: (
        // Lucide: Search
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
    {
      title: "Ask Questions",
      description: "Ask questions about your GitHub repository and receive AI-generated answers.",
      action: () => {
        if (hasValidRepo) {
          navigate("/chat", { state: { repoMeta } });
        } else {
          focusRepoInput();
        }
      },
      badge: hasValidRepo ? "Start Chatting →" : "Paste repo to ask",
      icon: (
        // Lucide: MessageSquare
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];

  /* ── Features Section (Section 6) ─────────────────────────── */
  const featureList = [
    {
      title: "Repository Explorer",
      description: "Explore repository files and folders.",
      path: "/explorer",
      icon: (
        // Lucide: FolderTree
        <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M3 5v14a2 2 0 0 0 2 2h3" />
          <path d="M3 12h5" />
        </svg>
      ),
    },
    {
      title: "Intelligent Chunking",
      description: "Break source code into meaningful chunks.",
      path: "/chunks",
      icon: (
        // Lucide: Blocks
        <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
        </svg>
      ),
    },
    {
      title: "Semantic Embeddings",
      description: "Convert code into vector representations.",
      path: "/embeddings",
      icon: (
        // Lucide: Cpu
        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="16" x="4" y="4" rx="2" />
          <rect width="6" height="6" x="9" y="9" rx="1" />
          <path d="M15 2v2" />
          <path d="M15 20v2" />
          <path d="M2 15h2" />
          <path d="M2 9h2" />
          <path d="M20 15h2" />
          <path d="M20 9h2" />
          <path d="M9 2v2" />
          <path d="M9 20v2" />
        </svg>
      ),
    },
    {
      title: "Vector Search",
      description: "Find relevant code using semantic similarity.",
      path: "/vector",
      icon: (
        // Lucide: Database
        <svg className="w-5 h-5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5V19A9 3 0 0 0 21 19V5" />
          <path d="M3 12A9 3 0 0 0 21 12" />
        </svg>
      ),
    },
    {
      title: "AI-Powered Chat",
      description: "Ask questions about your repository.",
      path: "/chat",
      icon: (
        // Lucide: Bot
        <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      ),
    },
    {
      title: "Code Understanding",
      description: "Understand code structure and relationships.",
      path: "/chat",
      icon: (
        // Lucide: GitFork
        <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
          <path d="M12 12v3" />
        </svg>
      ),
    },
  ];

  const handleFeatureClick = (path) => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (hasValidRepo) {
      navigate(path, { state: { repoMeta } });
    } else {
      focusRepoInput();
    }
  };

  return (
    <MainLayout>
      {/* ── Navigation Bar (Section 3) ──────────────────────────── */}
      <header className="landing-header">
        {/* Left Side: GitHub-related Icon & Compact Branding */}
        <div
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 cursor-pointer group select-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#181924] border border-white/10 flex items-center justify-center text-white shadow-sm group-hover:border-violet-500/40 group-hover:bg-violet-600/10 transition-all">
            {/* GitHub Mark */}
            <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white group-hover:text-slate-200 transition-colors">
            GitHub Chatbot
          </span>
        </div>

        {/* Right Side: Authentication Actions */}
        <div className="flex items-center gap-3">
          {/* Active Repo Quick Status Pill */}
          {user && hasValidRepo && (
            <button
              onClick={() => navigate("/chat", { state: { repoMeta } })}
              className="hidden sm:inline-flex items-center gap-2 text-xs font-medium text-[#9DA1B4] hover:text-white bg-[#181924] border border-white/[0.08] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition-all"
              title="Jump to active chat"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px] max-w-[130px] truncate">{repoMeta.repository_name}</span>
            </button>
          )}

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

      {/* ── Full-Screen Loading Feedback Overlay ─────────────────── */}
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
              <p className="text-[#6F7285] text-xs mt-1.5">
                Parsing AST, generating semantic chunks, and building FAISS vector index
              </p>
            </div>
            <LoadingSpinner />
            <p className="text-[#6F7285] text-xs font-mono break-all bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
              {repoUrl}
            </p>
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────── */}
      <main className="landing-main">

        {/* ── Hero Section (Section 4) ─────────────────────────── */}
        <section className="landing-hero">
          {/* Subtle Background Glow */}
          <div className="landing-hero-glow" />

          {/* Badge */}
          <div className="landing-badge">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span>AI-Powered Codebase Intelligence</span>
          </div>

          {/* Main Heading */}
          <h1 className="landing-heading">
            GitHub <span className="landing-heading-accent">Chatbot</span>
          </h1>

          {/* Subtitle */}
          <p className="landing-subtitle">
            Understand any GitHub repository. Explore code, discover connections, and get intelligent answers from your codebase.
          </p>

          {/* Error Notification */}
          {cloneError && (
            <div className="w-full max-w-xl mb-4 text-left">
              <ErrorNotification message={cloneError} onDismiss={() => setCloneError(null)} />
            </div>
          )}

          {/* Repository Input Field */}
          <div className="landing-input-container">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
              <div className="relative flex-1 flex items-center">
                {/* GitHub Icon inside input */}
                <span className="absolute left-3.5 text-[#6F7285] pointer-events-none">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
                  </svg>
                </span>
                <input
                  id="repo-url-input"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="Paste your GitHub repository URL..."
                  disabled={isCloning}
                  className="landing-input"
                />
              </div>

              {/* Primary Action Button */}
              <button
                id="analyze-btn"
                onClick={() => handleAnalyze()}
                disabled={isCloning || !repoUrl.trim()}
                className="landing-btn-analyze"
              >
                {isCloning ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <span>Analyze Repository</span>
                    <span className="text-violet-200">→</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Helpful quick try hint */}
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-[#6F7285]">
            <span>Try example:</span>
            <button
              onClick={() => {
                setRepoUrl("https://github.com/facebook/react");
                setCloneError(null);
              }}
              className="text-[#9DA1B4] hover:text-violet-300 font-mono underline decoration-dotted underline-offset-4 transition-colors"
            >
              facebook/react
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setRepoUrl("https://github.com/pallets/flask");
                setCloneError(null);
              }}
              className="text-[#9DA1B4] hover:text-violet-300 font-mono underline decoration-dotted underline-offset-4 transition-colors"
            >
              pallets/flask
            </button>
          </div>
        </section>

        {/* ── Active Repository Snapshot (when connected) ───────── */}
        {user && hasValidRepo && (
          <section className="landing-active-repo">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-emerald-400 font-medium uppercase tracking-wider block">
                    Active Repository
                  </span>
                  <h3 className="text-base font-bold text-white font-mono leading-tight">
                    {repoMeta.owner} / {repoMeta.repository_name}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => navigate("/chat", { state: { repoMeta } })}
                className="landing-btn-analyze !py-2 !px-4 !text-xs"
              >
                Continue Chatting →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 mt-3 border-t border-white/[0.06]">
              {[
                { label: "Branch", value: repoMeta.branch || "HEAD", color: "text-emerald-400" },
                { label: "Total Files", value: repoMeta.total_files?.toLocaleString() ?? 0, color: "text-white" },
                { label: "Supported", value: repoMeta.supported_files?.toLocaleString() ?? 0, color: "text-violet-300" },
                { label: "Languages", value: repoMeta.languages?.length ?? 0, color: "text-cyan-300" },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#181924] border border-white/[0.05] rounded-lg p-2.5 text-center">
                  <span className="text-[10px] text-[#6F7285] uppercase tracking-wider block font-medium">{stat.label}</span>
                  <span className={`text-sm font-bold ${stat.color} font-mono mt-0.5 block`}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Quick Action Cards Section (Section 5) ───────────── */}
        <section className="landing-section">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {quickActionCards.map((card) => (
              <button
                key={card.title}
                onClick={card.action}
                className="landing-quickstart-card group"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="landing-icon-disc text-[#9DA1B4] group-hover:text-violet-300 transition-colors">
                    {card.icon}
                  </div>
                  <span className="text-[11px] font-medium text-[#6F7285] group-hover:text-violet-300 transition-colors">
                    {card.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white group-hover:text-violet-200 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-[#9DA1B4] mt-1.5 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Features Section (Section 6) ─────────────────────── */}
        <section className="landing-section">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Everything you need to understand your codebase
            </h2>
            <p className="text-sm text-[#9DA1B4] mt-2.5 leading-relaxed">
              From AST syntax parsing to vector similarity search, a complete intelligent pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {featureList.map((feature) => (
              <div
                key={feature.title}
                onClick={() => handleFeatureClick(feature.path)}
                className="landing-feature-card group"
              >
                <div className="landing-icon-disc">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-violet-200 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-[#9DA1B4] mt-1.5 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div className="mt-auto pt-2 flex items-center text-[11px] font-medium text-[#6F7285] group-hover:text-violet-300 transition-colors">
                  <span>Explore feature</span>
                  <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer (Section 8) ─────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1.5 text-center md:text-left">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-[#181924] border border-white/10 flex items-center justify-center text-white">
                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">GitHub Chatbot</span>
            </div>
            <p className="text-xs text-[#6F7285] max-w-sm">
              AI-powered codebase intelligence. Explore architecture, parse syntax trees, and ask questions about any repository.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-[#6F7285]">
            {hasValidRepo && repoMeta?.repository_name && (
              <a
                href={`https://github.com/${repoMeta.owner}/${repoMeta.repository_name}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors"
              >
                <span>View {repoMeta.repository_name} on GitHub</span>
                <span>↗</span>
              </a>
            )}
            <span>© {new Date().getFullYear()} GitHub Chatbot. Built with FastAPI, Gemini, Tree-sitter & FAISS.</span>
          </div>
        </div>
      </footer>
    </MainLayout>
  );
}
