import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/** A 4xx answer (forbidden, not found, validation) won't change on a second try; only retry network/5xx once. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * One loading model for the whole app (ux-redesign-v2 §1.1):
 * - revisits render from cache and refresh quietly (no skeleton flash on every visit);
 * - an error shows in about a second, not after three backed-off retries;
 * - changing a filter or month keeps the old rows on screen until the new ones arrive.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetry,
        retryDelay: 800,
        refetchOnWindowFocus: true,
        placeholderData: keepPreviousData,
      },
    },
  });
}
