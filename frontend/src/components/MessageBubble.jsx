import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { isValidRepoMeta } from "../context/ChatContext";

// ── Inline Markdown Renderer ──────────────────────────────────────────────

function MarkdownRenderer({ text, onCopyCode }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join("\n");
      elements.push(
        <CodeBlock key={i} lang={lang} code={code} onCopy={onCopyCode} />
      );
      i++;
      continue;
    }

    // Header
    const hMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const cls =
        level === 1
          ? "text-base font-bold text-white mt-4 mb-2 tracking-tight"
          : level === 2
          ? "text-sm font-bold text-slate-100 mt-3 mb-1.5 tracking-tight"
          : "text-xs font-semibold text-slate-200 mt-2 mb-1";
      elements.push(
        <p key={i} className={cls}>
          {renderInline(hMatch[2])}
        </p>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-white/[0.08] my-3" />);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div
          key={i}
          className="border-l-2 border-violet-500/60 pl-3.5 text-slate-300 italic text-[13px] my-2 bg-violet-500/[0.03] py-1 rounded-r-lg"
        >
          {renderInline(line.slice(2))}
        </div>
      );
      i++;
      continue;
    }

    // Bullet list
    if (/^(\s*[-*+])\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^(\s*[-*+])\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-outside space-y-1 my-2 pl-4 text-slate-300 text-[13px]">
          {items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={i} className="list-decimal list-outside space-y-1 my-2 pl-4 text-slate-300 text-[13px]">
          {items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(it)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} className="text-[#F5F5FA] text-[13.5px] leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

/** Render inline markdown: bold, italic, inline code, links */
function renderInline(text) {
  if (!text) return null;
  const parts = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0].startsWith("**"))
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[2]}</strong>);
    else if (match[0].startsWith("*"))
      parts.push(<em key={match.index} className="italic text-slate-300">{match[3]}</em>);
    else if (match[0].startsWith("`"))
      parts.push(
        <code key={match.index} className="font-mono text-[11px] bg-[#0B0C12] text-violet-300 px-1.5 py-0.5 rounded border border-white/10">
          {match[4]}
        </code>
      );
    else if (match[0].startsWith("["))
      parts.push(
        <a key={match.index} href={match[6]} target="_blank" rel="noopener noreferrer"
          className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
          {match[5]}
        </a>
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// ── Syntax-Highlighted Code Block with Copy ───────────────────────────────

const LANG_COLORS = {
  python: "text-blue-400", javascript: "text-yellow-400",
  typescript: "text-sky-400", jsx: "text-cyan-400", tsx: "text-cyan-400",
  java: "text-orange-400", go: "text-teal-400", rust: "text-orange-300",
  bash: "text-emerald-400", sh: "text-emerald-400", json: "text-amber-400",
  css: "text-pink-400", html: "text-orange-300", text: "text-slate-400",
};

function CodeBlock({ lang, code, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy?.(code);
    });
  };

  const langColor = LANG_COLORS[lang.toLowerCase()] || "text-slate-400";

  return (
    <div className="rounded-xl border border-white/[0.08] overflow-hidden my-3 shadow-lg bg-[#0B0C12]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#14151D] border-b border-white/[0.06]">
        <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${langColor}`}>
          {lang}
        </span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/5"
        >
          {copied ? (
            <><span className="text-emerald-400">✓</span> Copied</>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <pre className="overflow-x-auto p-4 text-[12px] font-mono leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Source References Panel ───────────────────────────────────────────────

const CHUNK_TYPE_META = {
  function:         { icon: "⚡", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  class:            { icon: "🏛️", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  method:           { icon: "🔧", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  module:           { icon: "📦", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  readme:           { icon: "📋", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  markdown_section: { icon: "📝", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
};

function SourcesPanel({ sources, repoMeta }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors py-1 group"
      >
        <span className={`inline-block transition-transform duration-200 text-xs ${open ? "rotate-90 text-cyan-400" : ""}`}>▶</span>
        <span className="font-medium">{sources.length} grounded code source{sources.length !== 1 ? "s" : ""}</span>
        <span className="text-[10px] text-slate-600 font-mono">({open ? "Click to collapse" : "Click to inspect"})</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sources.map((src, i) => {
            const meta = CHUNK_TYPE_META[src.chunk_type] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
            const pct = Math.round((src.score || 0) * 100);
            return (
              <div
                key={i}
                onClick={() => isValidRepoMeta(repoMeta) && navigate("/chunks", { state: { repoMeta } })}
                className={`rounded-xl border border-white/[0.08] p-3 bg-[#191A23] hover:border-cyan-500/40 transition-all ${
                  isValidRepoMeta(repoMeta) ? "cursor-pointer group" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-[9px] border rounded px-1.5 py-0.5 font-medium ${meta.color}`}>
                    {meta.icon} {src.chunk_type}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">{pct}% match</span>
                </div>
                <p className="text-xs font-mono font-semibold text-white truncate group-hover:text-cyan-300 transition-colors">
                  {src.symbol_name || "(module)"}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{src.file}</p>
                <p className="text-[9px] text-slate-500 mt-1 font-mono">
                  L{src.start_line}–{src.end_line} · {src.language}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Confidence Badge ──────────────────────────────────────────────────────

function ConfidenceBadge({ score }) {
  if (!score || score === 0) return null;
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : pct >= 60
      ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
      : "text-slate-400 border-slate-500/20 bg-white/5";
  return (
    <span className={`text-[10px] border rounded-full px-2 py-0.5 font-mono ${color}`}>
      {pct}% relevance
    </span>
  );
}

// ── Streaming Cursor ──────────────────────────────────────────────────────

function StreamCursor() {
  return (
    <span className="inline-block w-[2px] h-[14px] bg-violet-400 animate-pulse ml-0.5 align-middle rounded-sm shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
  );
}

// ── Main MessageBubble Component ──────────────────────────────────────────

export default function MessageBubble({ message, repoMeta }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(() => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.text]);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6 group`}>
      {/* AI Avatar Disc */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#14151D] border border-violet-500/30 flex items-center justify-center text-violet-300 text-xs font-bold mr-3 shrink-0 mt-0.5 shadow-md shadow-violet-600/10 ring-1 ring-white/5">
          AI
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[80%] ${isUser ? "" : "w-full"}`}>
        <div
          className={`rounded-2xl px-5 py-4 text-sm shadow-md transition-all ${
            isUser
              ? "bg-[#191A23] border border-white/[0.08] text-white rounded-br-sm ml-auto"
              : "bg-[#14151D] border border-white/[0.08] text-[#F5F5FA] rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#F5F5FA] font-medium">
              {message.text}
            </p>
          ) : (
            <>
              <MarkdownRenderer text={message.text} />
              {message.isStreaming && <StreamCursor />}
            </>
          )}
        </div>

        {/* AI Message Footer: Action Bar, Confidence, Sources */}
        {!isUser && message.text && !message.isStreaming && (
          <div className="mt-2 px-1">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleCopyAll}
                className="text-[11px] text-slate-500 hover:text-white transition-colors flex items-center gap-1.5 py-0.5"
                title="Copy response to clipboard"
              >
                {copied ? (
                  <span className="text-emerald-400 font-medium">✓ Copied</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>

              {message.confidence > 0 && (
                <ConfidenceBadge score={message.confidence} />
              )}

              {message.retrievedChunks > 0 && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {message.retrievedChunks} chunk{message.retrievedChunks !== 1 ? "s" : ""} retrieved
                </span>
              )}
            </div>

            <SourcesPanel sources={message.sources} repoMeta={repoMeta} />
          </div>
        )}
      </div>

      {/* User Avatar Disc */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-[#191A23] border border-white/[0.08] flex items-center justify-center text-slate-300 text-xs font-bold ml-3 shrink-0 mt-0.5 shadow-md">
          U
        </div>
      )}
    </div>
  );
}
