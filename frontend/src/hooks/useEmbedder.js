import { useState, useCallback, useRef } from "react";
import {
  generateEmbeddings,
  regenerateEmbeddings,
  getEmbeddingStatistics,
  getEmbeddingProgress,
  listEmbeddings,
} from "../services/api";

/**
 * useEmbedder — manages the Phase 5 embedding generation and dashboard state.
 *
 * Handles:
 *  - Triggering full generation or changed-only regeneration
 *  - Polling /embeddings/progress during a running generation
 *  - Loading statistics and embedding metadata list after completion
 *
 * @returns {{
 *   statistics: object | null,
 *   embeddings: Array,
 *   totalEmbeddings: number,
 *   progress: object | null,
 *   result: object | null,
 *   isGenerating: boolean,
 *   statsError: string | null,
 *   generateError: string | null,
 *   triggerGenerate: (name?: string) => Promise<void>,
 *   triggerRegenerate: (name?: string) => Promise<void>,
 *   clearErrors: () => void,
 * }}
 */
export function useEmbedder() {
  const [statistics, setStatistics] = useState(null);
  const [embeddings, setEmbeddings] = useState([]);
  const [totalEmbeddings, setTotalEmbeddings] = useState(0);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  // Keep a ref to cancel polling if the component unmounts
  const pollingRef = useRef(null);

  // ── Polling progress ─────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const p = await getEmbeddingProgress();
        setProgress(p);
        if (p?.is_complete) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        // silently ignore transient poll failures
      }
    }, 800);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── Post-generation data load ────────────────────────────────────
  const loadPostGenData = useCallback(async () => {
    try {
      const [stats, listResult] = await Promise.all([
        getEmbeddingStatistics(),
        listEmbeddings({ limit: 500 }),
      ]);
      setStatistics(stats);
      setEmbeddings(listResult.embeddings);
      setTotalEmbeddings(listResult.total);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to load embedding statistics.";
      setStatsError(detail);
    }
  }, []);

  // ── Core trigger logic ───────────────────────────────────────────
  const _run = useCallback(
    async (apiFn, repositoryName) => {
      setIsGenerating(true);
      setGenerateError(null);
      setProgress(null);
      startPolling();

      try {
        const res = await apiFn(repositoryName);
        setResult(res);
        await loadPostGenData();
      } catch (err) {
        const detail =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "Embedding generation failed. Make sure chunks are generated first.";
        setGenerateError(detail);
      } finally {
        stopPolling();
        setIsGenerating(false);
      }
    },
    [startPolling, stopPolling, loadPostGenData]
  );

  const triggerGenerate = useCallback(
    (name = "") => _run(generateEmbeddings, name),
    [_run]
  );

  const triggerRegenerate = useCallback(
    (name = "") => _run(regenerateEmbeddings, name),
    [_run]
  );

  const clearErrors = useCallback(() => {
    setGenerateError(null);
    setStatsError(null);
  }, []);

  return {
    statistics,
    embeddings,
    totalEmbeddings,
    progress,
    result,
    isGenerating,
    statsError,
    generateError,
    triggerGenerate,
    triggerRegenerate,
    clearErrors,
  };
}
