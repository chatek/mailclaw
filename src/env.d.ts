// Extend CloudflareBindings with secrets not in wrangler.jsonc.
// Bindings (D1, SEND_EMAIL, ATTACHMENTS) are auto-generated into
// worker-configuration.d.ts; ATTACHMENTS is declared here too so type
// checking passes before `bun run cf-typegen` is run after adding the binding.
interface CloudflareBindings {
	API_TOKEN: string;
	RESEND_API_KEY?: string;
	EMAIL_PROVIDER?: string; // "resend" | "cloudflare" — defaults to "resend"
	ATTACHMENTS: R2Bucket;
}
