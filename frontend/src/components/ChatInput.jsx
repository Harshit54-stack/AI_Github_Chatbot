import { useState, useRef, useEffect } from "react";

/**
 * ChatInput — Premium message composer fixed to the bottom of the chat workspace.
 * Features dark elevated surface (#14151D), violet/blue focus glow, auto-expanding textarea,
 * and responsive send button.
 */
export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  // Auto-grow textarea up to 6 rows (140px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-end gap-3 bg-[#14151D] border border-white/[0.09] focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:shadow-[0_0_24px_rgba(139,92,246,0.18)] rounded-2xl px-4 py-3 shadow-2xl transition-all duration-200 backdrop-blur-xl">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask anything about your repository..."
          className="flex-1 resize-none bg-transparent text-[#F5F5FA] placeholder-[#74758B] text-sm outline-none leading-relaxed max-h-[140px] scrollbar-thin"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-violet-600/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed shrink-0"
          aria-label="Send prompt"
          title="Send (Enter)"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#74758B] px-3 pt-2">
        <span>Shift + Enter for new line · Enter to send</span>
        <span className="hidden sm:inline">Grounded in FAISS Vector Context</span>
      </div>
    </div>
  );
}
