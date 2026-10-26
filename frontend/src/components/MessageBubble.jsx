import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── Inline markdown renderer (no external deps) ───────────────────────────

/**
 * Lightweight markdown-to-JSX renderer.
 * Handles: fenced code blocks, inline code, bold, italic, headers,
 * bullet lists, numbered lists, blockquotes, horizontal rules, links.
 */
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
          ? "text-base font-bold text-white mt-3 mb-1"
          : level === 2
          ? "text-sm font-bold text-slate-100 mt-2 mb-1"
          : "text-sm font-semibold text-slate-200 mt-1";
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
      elements.push(<hr key={i} className="border-white/10 my-2" />);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div
          key={i}
          className="border-l-2 border-violet-500/50 pl-3 text-slate-400 italic text-[13px] my-1"
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
        <ul key={i} className="list-disc list-inside space-y-0.5 my-1 pl-1">
          {items.map((it, j) => (
            <li key={j} className="text-slate-300 text-[13px]">
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
        <ol key={i} className="list-decimal list-inside space-y-0.5 my-1 pl-1">
          {items.map((it, j) => (
            <li key={j} className="text-slate-300 text-[13px]">
              {renderInline(it)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
      i++;
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} className="text-slate-200 text-[13px] leading-relaxed">
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
  // Split on bold (**), italic (*), inline code (`), links [text](url)
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
        <code key={match.index} className="font-mono text-[11px] bg-black/30 text-violet-300 px-1.5 py-0.5 rounded">
          {match[4]}
        </code>
      );
    else if (match[0].startsWith("["))
      parts.push(
        <a key={match.index} href={match[6]} target="_blank" rel="noopener noreferrer"
          className="text-violet-400 underline underline-offset-2 hover:text-violet-300">
          {match[5]}
        </a>
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// ── Code block with copy button ───────────────────────────────────────────

const LANG_COLORS = {
  python: "text-blue-400", javascript: "text-yellow-400",
  typescript: "text-sky-400", jsx: "text-cyan-400", tsx: "text-cyan-400",
  java: "text-orange-400", go: "text-teal-400", rust: "text-orange-300",
  bash: "text-green-400", sh: "text-green-400", json: "text-amber-400",
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
    <div className="rounded-xl border border-white/10 overflow-hidden my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.05] border-b border-white/10">
        <span className={`text-[10px] font-mono font-semibold ${langColor}`}>
          {lang}
        </span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <><span className="text-emerald-400">✓</span> Copied</>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <pre className="overflow-x-auto p-3 text-[12px] font-mono leading-relaxed text-slate-300 bg-black/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Source References panel ───────────────────────────────────────────────

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
    <div className="mt-2">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-violet-400 transition-colors"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <span>{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {sources.map((src, i) => {
            const meta = CHUNK_TYPE_META[src.chunk_type] || { icon: "📄", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
            const pct = Math.round((src.score || 0) * 100);
            return (
              <div
                key={i}
                onClick={() => repoMeta && navigate("/chunks", { state: { repoMeta } })}
                className={`rounded-lg border border-white/10 px-3 py-2 bg-white/[0.03] ${repoMeta ? "cursor-pointer hover:border-violet-500/30 hover:bg-violet-500/5 transition-colors" : ""}`}
              >
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[9px] border rounded px-1.5 py-0.5 font-medium ${meta.color}`}>
                    {meta.icon} {src.chunk_type}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-white truncate max-w-[180px]">
                    {src.symbol_name || "(module)"}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono ml-auto">{pct}%</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate">{src.file}</p>
                <p className="text-[9px] text-slate-700 mt-0.5">L{src.start_line}–{src.end_line} · {src.language}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────

function ConfidenceBadge({ score }) {
  if (!score || score === 0) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : pct >= 60 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-slate-500 border-slate-500/20 bg-white/5";
  return (
    <span className={`text-[9px] border rounded-full px-2 py-0.5 font-mono ${color}`}>
      {pct}% match
    </span>
  );
}

// ── Streaming cursor ──────────────────────────────────────────────────────

function StreamCursor() {
  return (
    <span className="inline-block w-[2px] h-[14px] bg-violet-400 animate-pulse ml-0.5 align-middle rounded-sm" />
  );
}

// ── Main MessageBubble ────────────────────────────────────────────────────

/**
 * MessageBubble — renders a single chat message with markdown, sources, and copy.
 *
 * @param {{
 *   message: {
 *     role: "user"|"ai",
 *     text: string,
 *     sources?: SourceRef[],
 *     confidence?: number,
 *     isStreaming?: boolean,
 *   },
 *   repoMeta: object | null,
 * }} props
 */
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
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-3 shrink-0 mt-1 shadow-lg shadow-violet-500/30">
          AI
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "" : "w-full"}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm shadow-md ${
            isUser
              ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-sm"
              : "bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[13px]">{message.text}</p>
          ) : (
            <>
              <MarkdownRenderer text={message.text} />
              {message.isStreaming && <StreamCursor />}
            </>
          )}
        </div>

        {/* AI footer: copy + confidence + sources */}
        {!isUser && message.text && !message.isStreaming && (
          <div className="mt-1.5 px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyAll}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1"
              >
                {copied ? (
                  <span className="text-emerald-500">✓ Copied</span>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
              {message.confidence > 0 && (
                <ConfidenceBadge score={message.confidence} />
              )}
              {message.retrievedChunks > 0 && (
                <span className="text-[9px] text-slate-700">
                  {message.retrievedChunks} chunk{message.retrievedChunks !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <SourcesPanel sources={message.sources} repoMeta={repoMeta} />
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold ml-3 shrink-0 mt-1 border border-white/10">
          U
        </div>
      )}
    </div>
  );
}
