import type {
	ApiResponse,
	AttachmentSummary,
	Email,
	EmailFilters,
	EmailSummary,
	PaginatedEmails,
	SendEmailRequest,
	SendEmailResponse,
} from "@/types";

// Server stores timestamps in Unix seconds; rest of the dashboard uses ms.
function secondsToMs<T extends { received_at?: number; created_at?: number }>(o: T): T {
	if (typeof o.received_at === "number") o.received_at *= 1000;
	if (typeof o.created_at === "number") o.created_at *= 1000;
	return o;
}

function normalizeSummary(e: EmailSummary): EmailSummary {
	return secondsToMs({ ...e });
}

function normalizeAttachment(a: AttachmentSummary): AttachmentSummary {
	return secondsToMs({ ...a });
}

function normalizeEmail(e: Email): Email {
	const out = secondsToMs({ ...e });
	if (out.attachments) out.attachments = out.attachments.map(normalizeAttachment);
	return out;
}

export class ApiError extends Error {
	code: string;
	status: number;
	constructor(code: string, message: string, status: number) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

function buildUrl(host: string, path: string, params?: Record<string, unknown>) {
	const base = host.trim().replace(/\/$/, "") || window.location.origin;
	const url = new URL(path, base);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined || v === null || v === "") continue;
			url.searchParams.set(k, String(v));
		}
	}
	return url.toString();
}

async function call<T>(
	host: string,
	token: string,
	path: string,
	init?: RequestInit & { params?: Record<string, unknown> },
): Promise<T> {
	const { params, headers, ...rest } = init ?? {};
	const url = buildUrl(host, path, params);
	const res = await fetch(url, {
		...rest,
		headers: {
			Authorization: `Bearer ${token}`,
			...(rest.body ? { "Content-Type": "application/json" } : {}),
			...headers,
		},
	});

	const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
	if (!body) {
		throw new ApiError("BAD_RESPONSE", `Non-JSON response (${res.status})`, res.status);
	}
	if (!body.success) {
		throw new ApiError(body.error.code, body.error.message, res.status);
	}
	return body.data;
}

export interface ClientCtx {
	host: string;
	token: string;
}

export const api = {
	async list(ctx: ClientCtx, filters: EmailFilters = {}) {
		const res = await call<PaginatedEmails>(ctx.host, ctx.token, "/api/emails", {
			params: filters as Record<string, unknown>,
		});
		res.emails = res.emails.map(normalizeSummary);
		return res;
	},

	async get(ctx: ClientCtx, id: string) {
		const email = await call<Email>(
			ctx.host,
			ctx.token,
			`/api/emails/${encodeURIComponent(id)}`,
		);
		return normalizeEmail(email);
	},

	delete: (ctx: ClientCtx, id: string) =>
		call<{ message: string }>(ctx.host, ctx.token, `/api/emails/${encodeURIComponent(id)}`, {
			method: "DELETE",
		}),

	send: (ctx: ClientCtx, body: SendEmailRequest) =>
		call<SendEmailResponse>(ctx.host, ctx.token, "/api/emails/send", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	health: (ctx: ClientCtx) =>
		call<{ status: string }>(ctx.host, ctx.token, "/api/health"),

	attachmentUrl: (ctx: ClientCtx, emailId: string, attachmentId: string) =>
		buildUrl(
			ctx.host,
			`/api/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
		),

	async downloadAttachment(
		ctx: ClientCtx,
		emailId: string,
		attachmentId: string,
		filename: string,
	) {
		const url = this.attachmentUrl(ctx, emailId, attachmentId);
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${ctx.token}` },
		});
		if (!res.ok) {
			throw new ApiError("DOWNLOAD_FAILED", `Download failed (${res.status})`, res.status);
		}
		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
	},
};
