/**
 * useChat — re-exported from ChatContext for backward compatibility.
 *
 * The chat state has been lifted to ChatContext (src/context/ChatContext.jsx)
 * so that it survives React Router navigation between pages. Any component
 * that previously imported from this file continues to work unchanged.
 */
export { useChat } from "../context/ChatContext";

