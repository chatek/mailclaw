import type { Context, Next } from "hono";
import { ERR } from "@/utils/http";

export async function authMiddleware(c: Context<{ Bindings: CloudflareBindings }>, next: Next) {
	const authHeader = c.req.header("Authorization");

	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(ERR("UNAUTHORIZED", "Missing or invalid Authorization header"), 401);
	}

	const token = authHeader.slice(7);

	if (token !== c.env.API_TOKEN) {
		return c.json(ERR("UNAUTHORIZED", "Invalid API token"), 401);
	}

	await next();
}
