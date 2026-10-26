import { useState, useCallback } from "react";
import { parseRepository } from "../services/api";

/**
 * useParser hook — manages the repository parse lifecycle.
 *
 * @returns {{
 *   parseSummary: object | null,
 *   isParsing: boolean,
 *   parseError: string | null,
 *   parseRepo: (name?: string) => Promise<boolean>,
 *   clearParseError: () => void,
 * }}
 */
export function useParser() {
  const [parseSummary, setParseSummary] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);

  const parseRepo = useCallback(async (repositoryName = "") => {
    setIsParsing(true);
    setParseError(null);

    try {
      const summary = await parseRepository(repositoryName);
      setParseSummary(summary);
      return true;
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Parsing failed. Make sure a repository is cloned first.";
      setParseError(detail);
      return false;
    } finally {
      setIsParsing(false);
    }
  }, []);

  const clearParseError = useCallback(() => setParseError(null), []);

  return { parseSummary, isParsing, parseError, parseRepo, clearParseError };
}
