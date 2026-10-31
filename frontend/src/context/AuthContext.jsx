import { createContext, useContext, useState, useCallback, useEffect } from "react";
import apiClient from "../services/api";

/**
 * AuthContext — application-level authentication state.
 *
 * - user: null (unauthenticated) | { id, email, name, picture }
 * - isLoading: true while checking the initial session on mount
 * - login(credential): sends Google ID token to backend, stores user
 * - logout(): calls backend logout, clears user state
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // loading until session check completes
  const [authError, setAuthError] = useState(null);

  // On mount, check whether there is an existing valid session.
  // This handles page refresh — the session cookie is sent automatically.
  useEffect(() => {
    apiClient
      .get("/auth/me", { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  /**
   * login — send Google ID token to backend, update user state.
   * @param {string} credential  Google ID token from GSI callback
   */
  const login = useCallback(async (credential) => {
    setAuthError(null);
    try {
      const res = await apiClient.post(
        "/auth/google",
        { credential },
        { withCredentials: true }
      );
      setUser(res.data);
      return res.data;
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Authentication failed. Please try again.";
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  /**
   * logout — invalidate the server-side session and clear local state.
   */
  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout", {}, { withCredentials: true });
    } catch {
      // Best-effort — clear client state regardless
    }
    setUser(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, authError, login, logout, setAuthError, clearAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
