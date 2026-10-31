import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Sidebar from "../components/Sidebar";
import MessageBubble from "../components/MessageBubble";
import ChatInput from "../components/ChatInput";
import ErrorNotification from "../components/ErrorNotification";
import { useChat, isValidRepoMeta } from "../context/ChatContext";

const SUGGESTED_PROMPTS = [
  {
    title: "Explain repository architecture",
    description: "High-level system design, dependencies, and module relationships.",
    prompt: "Explain the project architecture and high-level component design.",
    icon: (
      <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
    glowClass: "glow-card-violet",
  },
  {
    title: "Summarize the codebase",
    description: "Overview of tech stack, core business features, and directory layout.",
    prompt: "Provide a comprehensive summary of this repository, its features, and tech stack.",
    icon: (
      <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    ),
    glowClass: "glow-card-cyan",
  },
  {
    title: "Where is authentication implemented?",
    description: "Session tokens, JWT or cookies, Google OAuth, and auth middleware.",
    prompt: "Where is authentication implemented in this repository? Trace the login and verification flow.",
    icon: (
      <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    glowClass: "glow-card-amber",
  },
  {
    title: "Explain the database schema",
    description: "Inspect data models, relationships, migration scripts, and storage layers.",
    prompt: "Explain the database schema, models, and data relationships in this project.",
    icon: (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    glowClass: "glow-card-emerald",
  },
  {
    title: "Find API endpoints",
    description: "List HTTP routes, REST methods, parameters, and controllers.",
    prompt: "List all API endpoints and routes exposed by this project with their methods and descriptions.",
    icon: (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    glowClass: "glow-card-blue",
  },
  {
    title: "Trace execution flows",
    description: "Step through logical call chains from entrypoint to service handlers.",
    prompt: "Trace the primary user flow or execution path from request entrypoint to response output.",
    icon: (
      <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    glowClass: "glow-card-violet",
  },
];

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { messages, isLoading, error, sendMessage, newChat, clearError, repoMeta, setRepoMeta } = useChat();
  const bottomRef = useRef(null);

  const hasValidRepo = isValidRepoMeta(repoMeta);

  // Sync repoMeta from navigation state into context
  useEffect(() => {
    if (location.state?.repoMeta && isValidRepoMeta(location.state.repoMeta)) {
      setRepoMeta(location.state.repoMeta);
    }
  }, [location.state, setRepoMeta]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const headerLabel = hasValidRepo
    ? `${repoMeta.owner}/${repoMeta.repository_name}`
    : "AI Assistant";

  const handlePromptSelect = (promptText) => {
    if (hasValidRepo) {
      sendMessage(promptText, repoMeta.repository_name);
    }
  };

  return (
    <MainLayout>
      <div className="flex h-screen overflow-hidden bg-[#08090D]">
        {/* ── Collapsible Left Global Sidebar ─────────────────── */}
        <Sidebar repoMeta={repoMeta} />

        {/* ── Main Chat Area ──────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 h-full relative">
          {/* Top Application Header */}
          <header className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.08] bg-[#0D0E14]/80 backdrop-blur-md shrink-0 z-20">
            <button
              onClick={() => navigate("/")}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
              aria-label="Back to home"
              title="Back to home"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate font-mono">{headerLabel}</h2>
                {hasValidRepo && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" title="Connected" />
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Retrieval-Augmented Generation · Gemini 1.5</p>
            </div>

            {/* Repository telemetry pills */}
            {hasValidRepo && (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md px-2 py-0.5 font-mono">
                  {repoMeta.branch || "HEAD"}
                </span>
                {repoMeta.languages?.length > 0 && (
                  <span className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-md px-2 py-0.5 font-mono">
                    {repoMeta.languages.length} lang{repoMeta.languages.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[10px] bg-white/5 border border-white/[0.08] text-slate-400 rounded-md px-2 py-0.5 font-mono">
                  {repoMeta.supported_files ?? 0} files
                </span>
              </div>
            )}

            {/* Clear conversation / New Chat button */}
            {hasValidRepo && messages.length > 0 && (
              <button
                onClick={newChat}
                className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 rounded-xl px-2.5 py-1.5 hover:border-violet-500/30 hover:text-white transition-all shrink-0 bg-white/[0.02]"
                title="Clear current session and start a new conversation"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>New Chat</span>
              </button>
            )}

            {/* Explorer quick link */}
            {hasValidRepo && (
              <button
                id="open-explorer-btn"
                onClick={() => navigate("/explorer", { state: { repoMeta } })}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-cyan-300 transition-colors border border-white/10 rounded-xl px-3 py-1.5 hover:border-cyan-500/30 shrink-0 bg-[#14151D]"
                title="Open Repository Explorer"
              >
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                <span className="hidden sm:inline font-medium">Explorer</span>
              </button>
            )}
          </header>

          {/* Error Banner */}
          {error && (
            <div className="px-5 pt-3 shrink-0">
              <ErrorNotification message={error} onDismiss={clearError} />
            </div>
          )}

          {/* Body: No Repo Loaded vs Chat Stream */}
          {!hasValidRepo ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center select-none">
              <div className="icon-disc !w-16 !h-16 text-3xl">
                💬
              </div>
              <div>
                <p className="text-white font-bold text-base">No Repository Active</p>
                <p className="text-slate-400 text-xs mt-1 max-w-sm leading-relaxed">
                  Clone or analyze a GitHub repository from the home dashboard to begin chatting with its codebase.
                </p>
              </div>
              <button
                onClick={() => navigate("/")}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-violet-600/20"
              >
                Go to Home Dashboard →
              </button>
            </div>
          ) : (
            <>
              {/* Message History & Welcome Experience */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-2 scroll-smooth">
                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center min-h-[75%] max-w-4xl mx-auto my-auto py-8">
                    {/* Welcome Header */}
                    <div className="text-center space-y-2 mb-8">
                      <div className="icon-disc !w-12 !h-12 mx-auto mb-3 shadow-[0_0_20px_rgba(139,92,246,0.25)]">
                        <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                        </svg>
                      </div>
                      <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                        Your codebase,{" "}
                        <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                          understood.
                        </span>
                      </h2>
                      <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                        Explore your repository, understand complex code, trace execution flows, and get answers grounded in your source code.
                      </p>
                    </div>

                    {/* Suggested Prompt Cards (References 2 & 3 style) */}
                    <div className="w-full">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-semibold mb-3 text-center sm:text-left">
                        Suggested Inquiries
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {SUGGESTED_PROMPTS.map((item) => (
                          <div
                            key={item.title}
                            onClick={() => handlePromptSelect(item.prompt)}
                            className={`glow-card ${item.glowClass} p-4 flex flex-col justify-between cursor-pointer group text-left`}
                          >
                            <div className="space-y-2.5">
                              <div className="icon-disc !w-8 !h-8 group-hover:scale-105 transition-transform">
                                {item.icon}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-white tracking-tight group-hover:text-violet-200 transition-colors">
                                  {item.title}
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                            <div className="pt-3 flex items-center gap-1 text-[10px] font-semibold text-slate-400 group-hover:text-cyan-300 transition-colors">
                              <span>Ask AI</span>
                              <span className="group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Message stream */}
                <div className="max-w-4xl mx-auto w-full">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} repoMeta={repoMeta} />
                  ))}
                </div>

                <div ref={bottomRef} />
              </div>

              {/* Fixed Bottom Message Composer */}
              <div className="px-4 sm:px-8 pb-5 pt-2 shrink-0 bg-gradient-to-t from-[#08090D] via-[#08090D]/90 to-transparent z-20">
                <ChatInput
                  onSend={(text) => sendMessage(text, repoMeta.repository_name)}
                  disabled={isLoading}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
