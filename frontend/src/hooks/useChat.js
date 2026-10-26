import { useState, useCallback, useRef } from "react";
import { streamRAGMessage, clearChatHistory } from "../services/api";

/**
 * useChat — Phase 7 RAG-powered chat hook.
 *
 * Drives the SSE streaming pipeline:
 *   POST /chat/stream → token chunks → sources → done event
 *
 * Message shape:
 *   {
 *     id: string,
 *     role: "user" | "ai",
 *     text: string,          // accumulated text (grows during streaming)
 *     sources: SourceRef[],  // populated after "sources" SSE event
 *     confidence: number,    // populated after "done" SSE event
 *     retrievedChunks: number,
 *     isStreaming: boolean,  // true while tokens are still arriving
 *   }
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState("");

  // Track the current repo name for clearing history
  const repoRef = useRef("");

  const _updateLastAI = useCallback((updater) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIdx = next.length - 1;
      if (lastIdx >= 0 && next[lastIdx].role === "ai") {
        next[lastIdx] = { ...next[lastIdx], ...updater(next[lastIdx]) };
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (text, repositoryName, topK = 5) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      repoRef.current = repositoryName;

      // Add user message
      const userMsg = {
        id: `${Date.now()}-user`,
        role: "user",
        text: trimmed,
        sources: [],
        confidence: 0,
        retrievedChunks: 0,
        isStreaming: false,
      };

      // Add placeholder AI message
      const aiMsg = {
        id: `${Date.now()}-ai`,
        role: "ai",
        text: "",
        sources: [],
        confidence: 0,
        retrievedChunks: 0,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsLoading(true);
      setError(null);

      const body = {
        repository: repositoryName,
        question: trimmed,
        top_k: topK,
        session_id: sessionId,
      };

      await streamRAGMessage(
        body,
        // onEvent
        (event) => {
          if (event.type === "chunk") {
            _updateLastAI((msg) => ({ text: msg.text + event.text }));
          } else if (event.type === "sources") {
            _updateLastAI(() => ({ sources: event.sources || [] }));
          } else if (event.type === "done") {
            if (event.session_id) setSessionId(event.session_id);
            _updateLastAI(() => ({
              confidence: event.confidence ?? 0,
              retrievedChunks: event.retrieved_chunks ?? 0,
              isStreaming: false,
            }));
          } else if (event.type === "error") {
            setError(event.message || "Unknown error from AI.");
            _updateLastAI(() => ({
              text: "⚠️ " + (event.message || "An error occurred."),
              isStreaming: false,
            }));
          }
        },
        // onDone
        () => {
          setIsLoading(false);
          _updateLastAI((msg) => ({ isStreaming: false }));
        },
        // onError
        (err) => {
          const msg =
            err?.message || "Connection failed. Is the backend running?";
          setError(msg);
          _updateLastAI(() => ({
            text: "⚠️ " + msg,
            isStreaming: false,
          }));
          setIsLoading(false);
        }
      );
    },
    [isLoading, sessionId, _updateLastAI]
  );

  const newChat = useCallback(async () => {
    if (sessionId) {
      try {
        await clearChatHistory(sessionId);
      } catch {
        // ignore — clearing history is best-effort
      }
    }
    setMessages([]);
    setSessionId("");
    setError(null);
  }, [sessionId]);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    sendMessage,
    newChat,
    clearError,
  };
}
