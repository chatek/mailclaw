import type { Email, EmailFilters, EmailSummary } from "@/types";

const EMAIL_COLUMNS =
	"id, from_address, to_address, subject, received_at, html_content, text_content, has_attachments, attachment_count";

export async function insertEmail(db: D1Database, email: Email) {
	try {
		const { success, error } = await db
			.prepare(
				`INSERT INTO emails (id, from_address, to_address, subject, received_at, html_content, text_content, has_attachments, attachment_count)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				email.id,
				email.from_address,
				email.to_address,
				email.subject,
				email.received_at,
				email.html_content,
				email.text_content,
				email.has_attachments,
				email.attachment_count,
			)
			.run();
		return { success, error };
	} catch (e: unknown) {
		return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
	}
}

function buildWhereClause(filters: EmailFilters): { where: string; params: unknown[] } {
	const conditions: string[] = [];
	const params: unknown[] = [];

	if (filters.from) {
		conditions.push("from_address = ?");
		params.push(filters.from);
	}
	if (filters.to) {
		conditions.push("to_address = ?");
		params.push(filters.to);
	}
	if (filters.q) {
		conditions.push("(subject LIKE ? OR text_content LIKE ?)");
		const keyword = `%${filters.q}%`;
		params.push(keyword, keyword);
	}
	if (filters.after) {
		conditions.push("received_at >= ?");
		params.push(filters.after);
	}
	if (filters.before) {
		conditions.push("received_at <= ?");
		params.push(filters.before);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	return { where, params };
}

export async function getEmails(db: D1Database, filters: EmailFilters) {
	try {
		const { where, params } = buildWhereClause(filters);

		const countResult = await db
			.prepare(`SELECT COUNT(*) as total FROM emails ${where}`)
			.bind(...params)
			.first<{ total: number }>();

		const { results } = await db
			.prepare(
				`SELECT id, from_address, to_address, subject, received_at, has_attachments, attachment_count
				 FROM emails ${where}
				 ORDER BY received_at DESC
				 LIMIT ? OFFSET ?`,
			)
			.bind(...params, filters.limit, filters.offset)
			.all();

		const emails = results.map((row) => ({
			...row,
			has_attachments: Boolean(row.has_attachments),
		})) as EmailSummary[];

		return { emails, total: countResult?.total ?? 0, error: undefined };
	} catch (e: unknown) {
		return { emails: [], total: 0, error: e instanceof Error ? e : new Error(String(e)) };
	}
}

export async function getEmailsExport(db: D1Database, filters: EmailFilters) {
	try {
		const { where, params } = buildWhereClause(filters);

		const countResult = await db
			.prepare(`SELECT COUNT(*) as total FROM emails ${where}`)
			.bind(...params)
			.first<{ total: number }>();

		const { results } = await db
			.prepare(
				`SELECT ${EMAIL_COLUMNS} FROM emails ${where}
				 ORDER BY received_at DESC
				 LIMIT ? OFFSET ?`,
			)
			.bind(...params, filters.limit, filters.offset)
			.all();

		const emails = results.map((row) => ({
			...row,
			has_attachments: Boolean(row.has_attachments),
		})) as Email[];

		return { emails, total: countResult?.total ?? 0, error: undefined };
	} catch (e: unknown) {
		return { emails: [], total: 0, error: e instanceof Error ? e : new Error(String(e)) };
	}
}

export async function getEmailById(db: D1Database, id: string) {
	try {
		const result = await db
			.prepare(`SELECT ${EMAIL_COLUMNS} FROM emails WHERE id = ?`)
			.bind(id)
			.first();
		if (!result) return { email: null, error: undefined };
		return {
			email: { ...result, has_attachments: Boolean(result.has_attachments) } as Email,
			error: undefined,
		};
	} catch (e: unknown) {
		return { email: null, error: e instanceof Error ? e : new Error(String(e)) };
	}
}

export async function deleteEmailById(db: D1Database, id: string) {
	try {
		const { meta } = await db.prepare("DELETE FROM emails WHERE id = ?").bind(id).run();
		return { deleted: (meta?.changes ?? 0) > 0, error: undefined };
	} catch (e: unknown) {
		return { deleted: false, error: e instanceof Error ? e : new Error(String(e)) };
	}
}
