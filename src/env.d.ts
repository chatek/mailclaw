// Extend CloudflareBindings with secrets not in wrangler.jsonc.
// Bindings (D1, SEND_EMAIL) are auto-generated into worker-configuration.d.ts.
interface CloudflareBindings {
	API_TOKEN: string;
	RESEND_API_KEY?: string;
	EMAIL_PROVIDER?: string; // "resend" | "cloudflare" — defaults to "resend"
}
