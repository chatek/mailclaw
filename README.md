# MailClaw

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/missuo/mailclaw)

A Cloudflare Workers-based email inbox service. Receives all emails sent to `*@yourdomain.com` via catch-all Email Routing, stores them in D1, and exposes a token-protected REST API for reading and searching emails.

Built to be consumed by AI agents (Claude Code, OpenClaw, etc.) for automated email processing.

## Features

- **Catch-all inbox** — Receive emails to any address on your domain
- **Full-text search** — Search emails by keyword in subject and body
- **Flexible filtering** — Filter by sender, recipient, date range
- **Export API** — Paginated export with full email content
- **Token authentication** — All API endpoints protected with Bearer token
- **Edge computing** — Runs on Cloudflare's global network

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) — Runtime
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — SQLite database
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) — Email receiving
- [Hono](https://hono.dev/) — Web framework
- [postal-mime](https://github.com/nicbn/postal-mime) — Email parsing
- [Bun](https://bun.sh/) — Package manager

## Prerequisites

- [Bun](https://bun.sh/) installed
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers access
- A domain added to Cloudflare with Email Routing enabled

## Deployment

### 1. Clone and install

```bash
git clone https://github.com/missuo/mailclaw
cd mailclaw
bun install
```

### 2. Authenticate with Cloudflare

```bash
bunx wrangler login
```

### 3. Create D1 database

```bash
bun run db:create
```

This will output a database ID. Copy it.

### 4. Update wrangler config

Edit `wrangler.jsonc` and replace `REPLACE_WITH_YOUR_DATABASE_ID` with the ID from step 3:

```jsonc
"d1_databases": [
  {
    "binding": "D1",
    "database_name": "mailclaw-d1",
    "database_id": "your-database-id-here"
  }
]
```

### 5. Initialize database

```bash
bun run db:tables
bun run db:indexes
```

### 6. Set API token

Generate a secure token and set it as a Worker secret:

```bash
# Generate a random token
openssl rand -hex 32

# Set it as a secret
bunx wrangler secret put API_TOKEN
```

Save this token — you'll need it to authenticate API requests.

### 7. Deploy

```bash
bun run deploy
```

Note the Worker URL from the output (e.g., `https://mailclaw.<your-subdomain>.workers.dev`).

### 8. Configure Email Routing

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain
3. Navigate to **Email** > **Email Routing** > **Routing rules**
4. Under **Catch-all address**, click **Edit**
5. Set action to **Send to a Worker**
6. Select the `mailclaw` worker
7. Save

All emails sent to `*@yourdomain.com` will now be received by MailClaw.

## API Reference

All `/api/emails*` endpoints require the `Authorization` header:

```
Authorization: Bearer <your-api-token>
```

### List emails

```
GET /api/emails
```

Returns email metadata (no body content). Supports pagination and filtering.

**Query parameters:**

| Parameter | Type   | Default | Description                                     |
| --------- | ------ | ------- | ----------------------------------------------- |
| `limit`   | number | 20      | Page size (1-100)                               |
| `offset`  | number | 0       | Pagination offset                               |
| `from`    | string | —       | Filter by sender (exact match)                  |
| `to`      | string | —       | Filter by recipient (exact match)               |
| `q`       | string | —       | Search keyword in subject and body              |
| `after`   | string | —       | Emails after date (ISO 8601 or Unix timestamp)  |
| `before`  | string | —       | Emails before date (ISO 8601 or Unix timestamp) |

**Example:**

```bash
# List recent emails
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails"

# Filter by sender and date range
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails?from=partner@company.com&after=2026-03-01"

# Search by keyword
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails?q=partnership"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": "clx...",
        "from_address": "partner@company.com",
        "to_address": "bd@yourdomain.com",
        "subject": "Partnership Inquiry",
        "received_at": 1710000000,
        "has_attachments": false,
        "attachment_count": 0
      }
    ],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

### Export emails (with content)

```
GET /api/emails/export
```

Same parameters as list, but includes `text_content` and `html_content` in the response.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails/export?limit=10"
```

### Get single email

```
GET /api/emails/:id
```

Returns full email including body content.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails/clx123abc"
```

### Delete email

```
DELETE /api/emails/:id
```

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails/clx123abc"
```

Deleting an email also removes its stored attachments from R2.

### List attachments

```
GET /api/emails/:id/attachments
```

Returns attachment metadata (id, filename, mime_type, size, created_at). Binary
content is stored in R2, not returned here.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://mailclaw.example.com/api/emails/clx123abc/attachments"
```

### Download an attachment

```
GET /api/emails/:id/attachments/:attachmentId
```

Streams the raw attachment bytes (not the JSON envelope) with `Content-Type`
and `Content-Disposition` set from the stored metadata.

```bash
curl -H "Authorization: Bearer $TOKEN" -OJ \
  "https://mailclaw.example.com/api/emails/clx123abc/attachments/att456"
```

### Send email

```
POST /api/emails/send
```

Sends an email via the configured provider. At least one of `html` or `text` is required.

**Body:**

```json
{
  "from": "noreply@yourdomain.com",
  "to": "recipient@example.com",
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>",
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "reply_to": "reply@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "<message-id>",
    "provider": "resend"
  }
}
```

### Health check

```
GET /api/health
```

No authentication required.

```bash
curl "https://mailclaw.example.com/api/health"
```

## Rust CLI

MailClaw also ships with a Rust binary CLI named `mailclaw`. It wraps the same API endpoints and stores local credentials in `~/.mailclaw/config.json`.

### Build or install

```bash
# Install into ~/.cargo/bin/mailclaw
cargo install --path .

# Or build a local release binary
cargo build --release
./target/release/mailclaw --help
```

### Configure

```bash
mailclaw config set \
  --host "https://mailclaw.example.com" \
  --api-token "your-api-token-here"

mailclaw health
```

### Common commands

```bash
# List recent email metadata
mailclaw list --limit 10

# Search emails and return machine-readable JSON
mailclaw list --q partnership --json

# Export full content
mailclaw export --from partner@company.com --limit 5 --json

# Read one email
mailclaw get clx123abc

# Delete one email
mailclaw delete clx123abc

# List attachments for an email
mailclaw attachments clx123abc

# Download an attachment (defaults to its original filename)
mailclaw download clx123abc att456 -o ./worksheet.pdf
```

### Quick install (macOS & Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/missuo/mailclaw/main/install.sh | bash
```

On macOS the script installs via Homebrew; on Linux it downloads the latest release binary for your architecture.

### Prebuilt binaries

GitHub Releases publish prebuilt CLI binaries for:

- `x86_64-unknown-linux-gnu`
- `aarch64-unknown-linux-gnu`
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`
- `x86_64-pc-windows-msvc`

If you prefer to install manually, download the binary for your platform from the latest release, rename it if needed, and put it on your `PATH`. The uploaded asset names follow this pattern:

```text
mailclaw-v1.0.0-<target>
mailclaw-v1.0.0-<target>.exe
```

### Release automation

Pushing a tag like `v0.1.0` triggers `.github/workflows/release-cli.yml`, which creates a GitHub Release and uploads the compiled CLI binaries directly.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## AI Agent Skills

MailClaw ships with a built-in [skill](https://agentskills.io) that lets AI agents (Claude Code, OpenClaw, etc.) read and manage your inbox.

### Add to Claude Code

```bash
npx skills add missuo/mailclaw
```

The skill now shells out to the local `mailclaw` CLI instead of calling `curl` directly. If the CLI is missing, the skill should install the latest release binary automatically by default on macOS, Linux, and Windows.

On first use, the skill will ask you for your **MailClaw Host** and **API Token**, then save them through `mailclaw config set` to `~/.mailclaw/config.json` for future sessions.

Once installed, you can use natural language like:

- "Check my recent emails"
- "Search emails from partner@company.com"
- "Read the latest email about partnership"
- "Show me all emails sent to tcook@apple.com this week"

The skill will automatically use the local `mailclaw` CLI to fetch and display results.

### Add to other AI agents

The skill definition is located at `skills/mailclaw/SKILL.md`. You can copy or adapt it for any AI agent framework that supports markdown-based skill definitions, or invoke the `mailclaw` CLI directly.

## Sending Email

MailClaw supports two send providers, selectable via the `EMAIL_PROVIDER` env var (defaults to `resend`):

- **`resend`** — Uses the [Resend API](https://resend.com). Requires `RESEND_API_KEY` secret. Verify your sending domain in the Resend dashboard.
- **`cloudflare`** — Uses the native [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) `send_email` binding. No external service required. Can send to any address once your sending domain is onboarded.

Both providers can send to any recipient; the sending domain must be verified.

### Use the Cloudflare Email Service

1. In the Cloudflare dashboard, go to **Email** > **Email Sending** > **Onboard Domain**, choose your domain, and add the DNS records (SPF, DKIM, DMARC, and `cf-bounce` MX). Requires the domain to use Cloudflare DNS.
2. The `SEND_EMAIL` binding is already configured in `wrangler.jsonc` with `"remote": true`, which routes calls to the Email Service.
3. Switch the provider:

   ```bash
   bunx wrangler secret put EMAIL_PROVIDER
   # enter: cloudflare
   ```

### Use Resend

1. Add your domain in [Resend](https://resend.com/domains) and configure the provided DNS records.
2. Set both secrets:

   ```bash
   bunx wrangler secret put RESEND_API_KEY
   bunx wrangler secret put EMAIL_PROVIDER
   # enter: resend   (or leave unset — resend is the default)
   ```

Outgoing sender addresses must use a domain that you own and have verified with the chosen provider.

## Local Development

Create a `.dev.vars` file for local secrets:

```
API_TOKEN=dev-token-here
```

Start the dev server:

```bash
bun run dev
```

## License

MIT
