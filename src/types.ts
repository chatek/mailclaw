export interface Email {
	id: string;
	from_address: string;
	to_address: string;
	subject: string | null;
	received_at: number;
	html_content: string | null;
	text_content: string | null;
	has_attachments: boolean;
	attachment_count: number;
	// Populated only on the single-email detail endpoint.
	attachments?: AttachmentSummary[];
}

export type EmailSummary = Omit<Email, "html_content" | "text_content">;

export interface Attachment {
	id: string;
	email_id: string;
	filename: string | null;
	mime_type: string | null;
	size: number;
	r2_key: string;
	created_at: number;
}

// Attachment metadata as exposed via the API (R2 key is internal).
export type AttachmentSummary = Omit<Attachment, "r2_key">;

export interface EmailFilters {
	from?: string;
	to?: string;
	q?: string;
	after?: number;
	before?: number;
	limit: number;
	offset: number;
}

export interface PaginatedResponse<T> {
	emails: T[];
	total: number;
	limit: number;
	offset: number;
}

export interface SendEmailRequest {
	from: string;
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	reply_to?: string | string[];
	headers?: Record<string, string>;
	tags?: { name: string; value: string }[];
	scheduled_at?: string;
}

export interface SendEmailResponse {
	id: string;
	provider: string;
}
