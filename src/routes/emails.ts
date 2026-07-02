import { Hono } from "hono";
import * as db from "@/database/d1";
import { createEmailProvider } from "@/providers";
import type { EmailFilters, SendEmailRequest } from "@/types";
import { parseTimestamp } from "@/utils/helpers";
import { ERR, OK } from "@/utils/http";

const emails = new Hono<{ Bindings: CloudflareBindings }>();

function parseFilters(query: Record<string, string>): EmailFilters {
	const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
	const offset = Math.max(Number(query.offset) || 0, 0);

	return {
		from: query.from || undefined,
		to: query.to || undefined,
		q: query.q || undefined,
		after: query.after ? (parseTimestamp(query.after) ?? undefined) : undefined,
		before: query.before ? (parseTimestamp(query.before) ?? undefined) : undefined,
		limit,
		offset,
	};
}

// List emails (metadata only)
emails.get("/api/emails", async (c) => {
	const filters = parseFilters(c.req.query());
	const { emails: results, total, error } = await db.getEmails(c.env.D1, filters);

	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	return c.json(OK({ emails: results, total, limit: filters.limit, offset: filters.offset }));
});

// Export emails (with full content)
emails.get("/api/emails/export", async (c) => {
	const filters = parseFilters(c.req.query());
	const { emails: results, total, error } = await db.getEmailsExport(c.env.D1, filters);

	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	return c.json(OK({ emails: results, total, limit: filters.limit, offset: filters.offset }));
});

// List attachment metadata for an email
emails.get("/api/emails/:id/attachments", async (c) => {
	const emailId = c.req.param("id");

	const { email, error: emailError } = await db.getEmailById(c.env.D1, emailId);
	if (emailError) return c.json(ERR("D1_ERROR", emailError.message), 500);
	if (!email) return c.json(ERR("NOT_FOUND", "Email not found"), 404);

	const { attachments, error } = await db.getAttachmentsByEmailId(c.env.D1, emailId);
	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	return c.json(OK({ attachments, total: attachments.length }));
});

// Download a single attachment (raw binary, not the JSON envelope)
emails.get("/api/emails/:id/attachments/:attachmentId", async (c) => {
	const emailId = c.req.param("id");
	const attachmentId = c.req.param("attachmentId");

	const { attachment, error } = await db.getAttachmentById(c.env.D1, emailId, attachmentId);
	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	if (!attachment) return c.json(ERR("NOT_FOUND", "Attachment not found"), 404);

	const object = await c.env.ATTACHMENTS.get(attachment.r2_key);
	if (!object) return c.json(ERR("NOT_FOUND", "Attachment content missing"), 404);

	const filename = attachment.filename || attachment.id;
	// RFC 5987 encoding so non-ASCII filenames survive the header.
	const encodedName = encodeURIComponent(filename);
	c.header("Content-Type", attachment.mime_type || "application/octet-stream");
	c.header("Content-Length", String(attachment.size));
	c.header(
		"Content-Disposition",
		`attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodedName}`,
	);
	return c.body(object.body);
});

// Get single email
emails.get("/api/emails/:id", async (c) => {
	const { email, error } = await db.getEmailById(c.env.D1, c.req.param("id"));

	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	if (!email) return c.json(ERR("NOT_FOUND", "Email not found"), 404);
	return c.json(OK(email));
});

// Delete single email (and its attachments from R2)
emails.delete("/api/emails/:id", async (c) => {
	const emailId = c.req.param("id");

	const { keys, error: keysError } = await db.getAttachmentKeysByEmailId(c.env.D1, emailId);
	if (keysError) return c.json(ERR("D1_ERROR", keysError.message), 500);

	const { deleted, error } = await db.deleteEmailById(c.env.D1, emailId);
	if (error) return c.json(ERR("D1_ERROR", error.message), 500);
	if (!deleted) return c.json(ERR("NOT_FOUND", "Email not found"), 404);

	if (keys.length > 0) {
		await c.env.ATTACHMENTS.delete(keys);
	}
	return c.json(OK({ message: "Email deleted" }));
});

// Send email
emails.post("/api/emails/send", async (c) => {
	let body: SendEmailRequest;
	try {
		body = await c.req.json<SendEmailRequest>();
	} catch {
		return c.json(ERR("INVALID_BODY", "Request body must be valid JSON"), 400);
	}

	if (!body.from || !body.to || !body.subject) {
		return c.json(ERR("MISSING_FIELDS", "from, to, and subject are required"), 400);
	}

	if (!body.html && !body.text) {
		return c.json(ERR("MISSING_CONTENT", "Either html or text content is required"), 400);
	}

	try {
		const provider = createEmailProvider(c.env);
		const result = await provider.send(body);
		return c.json(OK(result));
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to send email";
		return c.json(ERR("SEND_FAILED", message), 500);
	}
});

export default emails;
