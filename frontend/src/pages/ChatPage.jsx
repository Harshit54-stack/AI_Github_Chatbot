import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Sidebar from "../components/Sidebar";
import MessageBubble from "../components/MessageBubble";
import ChatInput from "../components/ChatInput";
import ErrorNotification from "../components/ErrorNotification";
import { useChat } from "../hooks/useChat";

const SUGGESTED_QUESTIONS = [
  "Explain project architecture",
  "Summarize the repository",
  "Where is authentication implemented?",
  "List all API endpoints",
  "Explain database flow",
  "Explain folder structure",
  "How does login work?",
];

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Phase 2: full repository metadata passed via navigation state
  const repoMeta = location.state?.repoMeta ?? null;

  const { messages, isLoading, error, sendMessage, newChat, clearError } = useChat();
  const bottomRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Derive a human-readable header label from metadata
  const headerLabel = repoMeta
    ? `${repoMeta.owner}/${repoMeta.repository_name}`
    : "AI Assistant";

  const handleSuggestClick = (q) => {
    if (repoMeta) {
      sendMessage(q, repoMeta.repository_name);
    }
  };

  return (
    <MainLayout>
      <div className="flex h-screen overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <Sidebar repoMeta={repoMeta} />

        {/* ── Main chat area ──────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Header */}
          <header className="flex items-center gap-4 px-5 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-md shrink-0">
            <button
              onClick={() => navigate("/")}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Back to home"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{headerLabel}</h2>
              <p className="text-[11px] text-slate-500">Retrieval-Augmented Generation Chat</p>
            </div>

            {/* Repository metadata pills (branch + language count) */}
            {repoMeta && (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full px-2.5 py-0.5 font-mono">
                  {repoMeta.branch || "HEAD"}
                </span>
                {repoMeta.languages?.length > 0 && (
                  <span className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full px-2.5 py-0.5">
                    {repoMeta.languages.length} lang{repoMeta.languages.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[10px] bg-white/5 border border-white/10 text-slate-400 rounded-full px-2.5 py-0.5">
                  {repoMeta.supported_files} files
                </span>
              </div>
            )}

            {/* Clear conversation / New Chat button */}
            {repoMeta && messages.length > 0 && (
              <button
                onClick={newChat}
                className="flex items-center gap-1 text-[11px] text-red-400 border border-red-500/20 rounded-lg px-2.5 py-1.5 hover:border-red-500/40 hover:bg-red-500/5 transition-all shrink-0 font-medium"
                title="Clear current session and start a new conversation"
              >
                🧹 New Chat
              </button>
            )}

            {/* Explorer navigation button */}
            {repoMeta && (
              <button
                id="open-explorer-btn"
                onClick={() => navigate("/explorer", { state: { repoMeta } })}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-violet-300 transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30 shrink-0"
                title="Open Repository Explorer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                <span className="hidden sm:inline">Explorer</span>
              </button>
            )}

            {/* Online indicator */}
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </div>
          </header>

          {/* Error banner */}
          {error && (
            <div className="px-5 pt-4 shrink-0">
              <ErrorNotification message={error} onDismiss={clearError} />
            </div>
          )}

          {/* Body panel */}
          {!repoMeta ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-600/10 border border-violet-500/10 flex items-center justify-center">
                <span className="text-3xl">💬</span>
              </div>
              <div>
                <p className="text-slate-300 font-medium">No Repository Loaded</p>
                <p className="text-slate-600 text-sm mt-1">Please select or clone a repository to begin chatting with its codebase.</p>
              </div>
              <button onClick={() => navigate("/")} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 hover:text-white transition-all">
                Go to Home →
              </button>
            </div>
          ) : (
            <>
              {/* Messages & Suggested Questions */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-1 scroll-smooth">
                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center min-h-[80%] text-center gap-6 select-none my-auto">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/25 to-indigo-600/25 border border-violet-500/25 flex items-center justify-center">
                        <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                      </div>
                      <p className="text-slate-300 font-medium mt-1">
                        {repoMeta.repository_name} is ready
                      </p>
                      <p className="text-slate-500 text-xs max-w-sm leading-relaxed">
                        Query the codebase semantically. The assistant will answer using only code context retrieved from this repository.
                      </p>
                    </div>

                    {/* Quick actions/Suggested questions */}
                    <div className="w-full max-w-lg mt-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3 text-center">Suggested Questions</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {SUGGESTED_QUESTIONS.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestClick(q)}
                            className="text-xs bg-white/5 border border-white/10 hover:border-violet-500/35 hover:bg-violet-500/5 text-slate-300 hover:text-white rounded-xl px-4 py-2 text-left cursor-pointer transition-all active:scale-98"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} repoMeta={repoMeta} />
                ))}

                <div ref={bottomRef} />
              </div>

              {/* Fixed input */}
              <div className="px-5 pb-5 pt-2 shrink-0 border-t border-white/5 bg-[#0a0a12]/80 backdrop-blur-md">
                <ChatInput
                  onSend={(text) => sendMessage(text, repoMeta.repository_name)}
                  disabled={isLoading}
                />
                <p className="text-center text-[10px] text-slate-700 mt-2">
                  Shift + Enter for new line · Enter to send · Grounded in Vector Search context
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

