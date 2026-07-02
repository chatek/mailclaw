import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type ClientCtx } from "@/api/client";
import type { DashboardConfig } from "@/lib/config";
import { playChime, showNotification } from "@/lib/notify";
import type { EmailFilters, EmailSummary, PaginatedEmails } from "@/types";

interface UseEmailsResult {
	data: PaginatedEmails | null;
	loading: boolean;
	error: string | null;
	lastFetched: number | null;
	refresh: () => Promise<void>;
}

const PAGE_SIZE = 50;

export function useEmails(
	ctx: ClientCtx,
	cfg: DashboardConfig,
	filters: EmailFilters,
	onNewEmail?: (email: EmailSummary) => void,
): UseEmailsResult {
	const [data, setData] = useState<PaginatedEmails | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastFetched, setLastFetched] = useState<number | null>(null);

	// Track most recent received_at to detect new emails on poll.
	const latestSeenRef = useRef<number | null>(null);
	const isFirstFetchRef = useRef(true);

	const refresh = useCallback(async () => {
		if (!ctx.token) return;
		setLoading(true);
		setError(null);
		try {
			const result = await api.list(ctx, { ...filters, limit: filters.limit ?? PAGE_SIZE });
			setData(result);
			setLastFetched(Date.now());

			if (result.emails.length > 0) {
				const topReceivedAt = result.emails[0].received_at;
				if (!isFirstFetchRef.current && latestSeenRef.current !== null) {
					const fresh = result.emails.filter((e) => e.received_at > (latestSeenRef.current ?? 0));
					for (const e of fresh) {
						onNewEmail?.(e);
					}
					if (fresh.length > 0) {
						if (cfg.soundEnabled) playChime();
						if (cfg.notificationsEnabled) {
							const first = fresh[0];
							const subj = first.subject?.trim() || "(no subject)";
							const title =
								fresh.length === 1
									? `New email — ${first.from_address}`
									: `${fresh.length} new emails`;
							showNotification(title, subj);
						}
					}
				}
				latestSeenRef.current = topReceivedAt;
			}
			isFirstFetchRef.current = false;
		} catch (err) {
			const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
			setError(msg);
		} finally {
			setLoading(false);
		}
	}, [ctx, filters, cfg.soundEnabled, cfg.notificationsEnabled, onNewEmail]);

	// Reset "first fetch" baseline when filters change so we don't bombard with notifs.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberate filter snapshot
	useEffect(() => {
		isFirstFetchRef.current = true;
		latestSeenRef.current = null;
	}, [filters.q, filters.from, filters.to, filters.after, filters.before]);

	// Polling.
	useEffect(() => {
		refresh();
		if (cfg.refreshSeconds <= 0) return;
		const id = window.setInterval(refresh, cfg.refreshSeconds * 1000);
		return () => window.clearInterval(id);
	}, [refresh, cfg.refreshSeconds]);

	// Refresh on focus.
	useEffect(() => {
		const onFocus = () => refresh();
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [refresh]);

	return { data, loading, error, lastFetched, refresh };
}
