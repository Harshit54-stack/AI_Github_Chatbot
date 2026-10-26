import { useState, useCallback } from "react";
import { cloneRepository } from "../services/api";

/**
 * useRepository hook — manages the full lifecycle of cloning a GitHub repo.
 *
 * @returns {{
 *   repoMeta: object | null,
 *   isCloning: boolean,
 *   cloneError: string | null,
 *   cloneRepo: (url: string) => Promise<boolean>,
 *   clearCloneError: () => void,
 * }}
 */
export function useRepository() {
  const [repoMeta, setRepoMeta] = useState(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState(null);

  /**
   * Clone the repository at *url*.
   * @param {string} url  A public GitHub repository URL.
   * @returns {Promise<boolean>} true on success, false on failure.
   */
  const cloneRepo = useCallback(async (url) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setCloneError("Please enter a GitHub repository URL.");
      return false;
    }

    setIsCloning(true);
    setCloneError(null);
    setRepoMeta(null);

    try {
      const meta = await cloneRepository(trimmed);
      setRepoMeta(meta);
      return true;
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to clone repository. Check the URL and try again.";
      setCloneError(detail);
      return false;
    } finally {
      setIsCloning(false);
    }
  }, []);

  const clearCloneError = useCallback(() => setCloneError(null), []);

  return { repoMeta, isCloning, cloneError, cloneRepo, clearCloneError };
}
