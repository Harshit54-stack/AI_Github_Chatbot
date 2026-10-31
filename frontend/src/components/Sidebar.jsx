import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import RepositoryStats from "./RepositoryStats";
import UserMenu from "./UserMenu";
import { useChat, isValidRepoMeta } from "../context/ChatContext";

/**
 * Sidebar — Polished, collapsible navigation workspace (#0D0E14)
 * with code-inspired branding, New Chat trigger, repository telemetry,
 * illuminated active nav pills, and session management.
 */
export default function Sidebar({ repoMeta }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { newChat } = useChat();
  const [collapsed, setCollapsed] = useState(false);

  const hasValidRepo = isValidRepoMeta(repoMeta);

  const navItems = [
    {
      label: "AI Chat",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
      path: "/chat",
      activeGlow: "border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.2)] bg-[#191A23] text-white",
      badgeColor: "text-violet-400",
    },
    {
      label: "Repository Explorer",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
        </svg>
      ),
      path: "/explorer",
      activeGlow: "border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] bg-[#191A23] text-white",
      badgeColor: "text-cyan-400",
    },
    {
      label: "Chunks",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      ),
      path: "/chunks",
      activeGlow: "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-[#191A23] text-white",
      badgeColor: "text-amber-400",
    },
    {
      label: "Embeddings",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      ),
      path: "/embeddings",
      activeGlow: "border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)] bg-[#191A23] text-white",
      badgeColor: "text-indigo-400",
    },
    {
      label: "Vector Database",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
      path: "/vector",
      activeGlow: "border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)] bg-[#191A23] text-white",
      badgeColor: "text-teal-400",
    },
  ];

  const handleNewChat = () => {
    newChat();
    navigate("/chat", { state: { repoMeta } });
  };

  return (
    <aside
      className={`hidden lg:flex flex-col ${
        collapsed ? "w-20" : "w-64"
      } bg-[#0D0E14] border-r border-white/[0.08] p-3.5 gap-4 shrink-0 overflow-y-auto transition-all duration-300 relative select-none`}
    >
      {/* ── Top branding & collapse trigger ─────────────────── */}
      <div className="flex items-center justify-between px-1.5 py-1 shrink-0">
        <div
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 cursor-pointer group"
          title="AI GitHub Assistant"
        >
          {/* Custom Code-Inspired Logo */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-600/30 ring-1 ring-white/10 group-hover:scale-105 transition-transform shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-xs font-bold tracking-tight text-white block truncate">
                AI GITHUB
              </span>
              <span className="text-[10px] text-slate-500 tracking-wider font-mono uppercase block -mt-0.5">
                Assistant
              </span>
            </div>
          )}
        </div>

        {/* Collapse / Expand Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-white/5"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* ── New Chat Action Button ───────────────────────────── */}
      <div className="shrink-0">
        <button
          onClick={handleNewChat}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-semibold bg-gradient-to-r from-violet-600/30 to-indigo-600/20 border border-violet-500/30 hover:border-violet-500/60 hover:bg-violet-600/30 text-violet-200 hover:text-white transition-all shadow-[0_0_12px_rgba(139,92,246,0.15)] group`}
          title="Start fresh conversation"
        >
          <svg
            className="w-4 h-4 text-violet-400 group-hover:rotate-90 transition-transform duration-200 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* ── Repository Status Section ────────────────────────── */}
      <div className="shrink-0">
        {!collapsed && (
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-medium px-1">
            Active Repository
          </p>
        )}
        <div className="bg-[#14151D] border border-white/[0.08] rounded-xl p-3 shadow-inner">
          {hasValidRepo ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-white truncate" title={repoMeta.repository_name}>
                  {repoMeta.repository_name}
                </p>
                <div className="flex items-center gap-1 shrink-0" title="Repository connected">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>

              {!collapsed && (
                <>
                  <p className="text-[11px] text-violet-300 font-mono truncate" title={`${repoMeta.owner}/${repoMeta.repository_name}`}>
                    {repoMeta.owner}/{repoMeta.repository_name}
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10px] text-slate-400 font-mono">
                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                      {repoMeta.branch || "HEAD"}
                    </span>
                    <span className="text-slate-500">
                      {repoMeta.supported_files ?? 0} files
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-1">
              <span className="text-xs text-slate-500 italic block">
                {collapsed ? "—" : "No repository active"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Collapsible Repository Stats Telemetry ───────────── */}
      {!collapsed && hasValidRepo && (
        <div className="shrink-0">
          <RepositoryStats meta={repoMeta} />
        </div>
      )}

      {/* ── Navigation Links ─────────────────────────────────── */}
      <div className="flex-1 space-y-1 min-h-0">
        {!collapsed && (
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-medium px-1">
            Workspace
          </p>
        )}
        {navItems.map(({ label, icon, path, activeGlow }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path, { state: { repoMeta } })}
              className={`w-full flex items-center ${
                collapsed ? "justify-center" : "gap-3"
              } text-xs border rounded-xl px-3 py-2.5 transition-all ${
                isActive
                  ? activeGlow
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
              title={label}
            >
              <span className="shrink-0">{icon}</span>
              {!collapsed && <span className="font-medium truncate">{label}</span>}
            </button>
          );
        })}
      </div>

      {/* ── User Session Footer ──────────────────────────────── */}
      <div className="mt-auto shrink-0 pt-2 border-t border-white/[0.08]">
        <UserMenu dropdownPosition="up" collapsed={collapsed} />
      </div>
    </aside>
  );
}
