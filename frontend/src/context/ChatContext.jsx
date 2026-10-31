import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { streamRAGMessage, clearChatHistory, getActiveRepository } from "../services/api";

/**
 * Validate that a repository metadata object contains the required properties.
 * Prevents empty objects ({}) or corrupted state from rendering undefined/undefined.
 */
export function isValidRepoMeta(meta) {
  return Boolean(
    meta &&
    typeof meta === "object" &&
    typeof meta.repository_name === "string" &&
    meta.repository_name.trim().length > 0 &&
    typeof meta.owner === "string" &&
    meta.owner.trim().length > 0
  );
}

/**
 * ChatContext — application-level chat state that survives route changes.
 *
 * Lifting useChat() logic here prevents the state from being destroyed when
 * ChatPage unmounts during navigation. The context value is created once and
 * persists for the entire browser session (cleared on page refresh / close).
 *
 * Additionally, repoMeta is stored here so it is not lost when the user
 * navigates away from /chat and returns without location.state.
 *
 * Lifecycle:
 *   - Navigation between sections  → state is preserved (context never unmounts)
 *   - "New Chat" button            → messages + sessionId cleared, backend session cleared
 *   - Page refresh / app close     → React state is garbage-collected (no persistence)
 */

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState("");

  /**
   * repoMeta is stored in context so it survives navigation away from /chat.
   * Only valid metadata objects (with repository_name and owner) or null are stored.
   */
  const [repoMeta, setRepoMetaState] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  const setRepoMeta = useCallback((meta) => {
    if (!meta) {
      setRepoMetaState(null);
    } else if (isValidRepoMeta(meta)) {
      setRepoMetaState(meta);
    } else {
      console.warn("Invalid repoMeta passed to setRepoMeta, ignored:", meta);
    }
  }, []);

  /**
   * Re-sync active repository from backend if not currently set.
   */
  const refreshRepoMeta = useCallback(async () => {
    setIsLoadingMeta(true);
    try {
      const active = await getActiveRepository();
      if (isValidRepoMeta(active)) {
        setRepoMetaState(active);
        return active;
      } else {
        setRepoMetaState(null);
        return null;
      }
    } catch {
      setRepoMetaState(null);
      return null;
    } finally {
      setIsLoadingMeta(false);
    }
  }, []);

  // Hydrate active repository on initial load if none set
  useEffect(() => {
    if (!repoMeta) {
      refreshRepoMeta();
    }
  }, [repoMeta, refreshRepoMeta]);

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

  /**
   * newChat — clears the current conversation.
   *
   * 1. Calls DELETE /chat/history on the backend to discard the AI's
   *    server-side conversation context so it cannot bleed into a new chat.
   * 2. Resets all client-side state: messages, sessionId, error.
   *
   * Repository data (clones, chunks, embeddings, vector index) is NOT touched.
   */
  const newChat = useCallback(async () => {
    if (sessionId) {
      try {
        await clearChatHistory(sessionId);
      } catch {
        // Clearing history is best-effort — don't block the UI reset.
      }
    }
    setMessages([]);
    setSessionId("");
    setError(null);
  }, [sessionId]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        isLoading,
        error,
        sessionId,
        repoMeta,
        isLoadingMeta,
        setRepoMeta,
        refreshRepoMeta,
        isValidRepoMeta,
        sendMessage,
        newChat,
        clearError,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

/**
 * useChat — consume the application-level chat context.
 *
 * Must be used inside <ChatProvider>. Replaces the old hook of the same name
 * so ChatPage requires no import changes.
 */
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used inside <ChatProvider>");
  }
  return ctx;
}
