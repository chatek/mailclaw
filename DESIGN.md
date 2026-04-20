# MailClaw - Design Document

## Overview

MailClaw is a Cloudflare Workers-based email service that receives emails via Cloudflare Email Routing (catch-all), stores them in D1, and exposes a token-protected REST API for reading, searching, exporting, and **sending** emails. Ships with a Rust CLI and a Claude Code skill. Designed to be consumed by AI agents (e.g., Claude Code Skills, OpenClaw) for automated email processing.

## Cloudflare Services

| Service | Purpose | Required |
|---|---|---|
| **Workers** | HTTP API + Email handler | Yes |
| **Email Routing** | Catch-all `*@domain.com` → Worker | Yes |
| **Email Service** | Outbound email via `send_email` binding | Optional (for Cloudflare send provider) |
| **D1 Database** | Email metadata + content storage | Yes |
| **R2 Storage** | Attachment file storage | Optional (Phase 2) |

## Architecture

```
Sender → Cloudflare Email Routing (catch-all) → Worker (email handler)
                                                     ↓
                                                postal-mime parse
                                                     ↓
                                                D1 (store email)

AI Agent → HTTP API (Bearer Token) → Worker (fetch handler) → D1 (query)
```

## Database Schema

### `emails` table

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | CUID2 unique identifier |
| `from_address` | TEXT NOT NULL | Sender email address |
| `to_address` | TEXT NOT NULL | Recipient email address |
| `subject` | TEXT | Email subject line |
| `received_at` | INTEGER NOT NULL | Unix timestamp (seconds) |
| `html_content` | TEXT | Original HTML body |
| `text_content` | TEXT | Plain text body |
| `has_attachments` | BOOLEAN | Whether email has attachments |
| `attachment_count` | INTEGER | Number of attachments |

### Indexes

- `(to_address, received_at DESC)` — filter by recipient, sort by date
- `(from_address, received_at DESC)` — filter by sender
- `(received_at DESC)` — date range queries
- `(subject)` — subject search (LIKE queries)

## API Design

### Authentication

All endpoints require `Authorization: Bearer <token>` header. Token is stored as a Cloudflare Worker secret (`API_TOKEN`).

### Endpoints

#### `GET /api/emails`

List emails with metadata only (no body content). Supports filtering and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 20 | Page size (max 100) |
| `offset` | number | 0 | Pagination offset |
| `from` | string | — | Filter by sender address (exact match) |
| `to` | string | — | Filter by recipient address (exact match) |
| `q` | string | — | Keyword search in subject + text_content |
| `after` | string | — | Emails after this date (ISO 8601 or Unix timestamp) |
| `before` | string | — | Emails before this date (ISO 8601 or Unix timestamp) |

**Response:**

```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": "clx...",
        "from_address": "partner@company.com",
        "to_address": "bd@example.com",
        "subject": "Partnership Inquiry",
        "received_at": 1710000000,
        "has_attachments": false,
        "attachment_count": 0
      }
    ],
    "total": 128,
    "limit": 20,
    "offset": 0
  }
}
```

#### `GET /api/emails/export`

Export emails with full body content. Same query parameters as `GET /api/emails`.

**Response:**

```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": "clx...",
        "from_address": "partner@company.com",
        "to_address": "bd@example.com",
        "subject": "Partnership Inquiry",
        "received_at": 1710000000,
        "has_attachments": false,
        "attachment_count": 0,
        "text_content": "Hello, we would like to...",
        "html_content": "<p>Hello, we would like to...</p>"
      }
    ],
    "total": 128,
    "limit": 20,
    "offset": 0
  }
}
```

#### `GET /api/emails/:id`

Get a single email with full content.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "from_address": "partner@company.com",
    "to_address": "bd@example.com",
    "subject": "Partnership Inquiry",
    "received_at": 1710000000,
    "text_content": "Hello, we would like to...",
    "html_content": "<p>Hello, we would like to...</p>",
    "has_attachments": false,
    "attachment_count": 0
  }
}
```

#### `DELETE /api/emails/:id`

Delete a single email.

#### `POST /api/emails/send`

Send an outbound email via the configured provider. At least one of `html` or `text` must be provided.

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
  "reply_to": "reply@example.com",
  "headers": { "X-Entity-Ref-ID": "abc123" }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "<provider-message-id>",
    "provider": "resend"
  }
}
```

### Send Providers

Provider selection is controlled by the `EMAIL_PROVIDER` secret (defaults to `resend`):

| Provider | Binding / Secret | Notes |
|---|---|---|
| `resend` | `RESEND_API_KEY` | Calls the Resend HTTPS API. Domain must be verified in Resend. |
| `cloudflare` | `SEND_EMAIL` binding (with `"remote": true`) | Uses the Cloudflare Email Service. Domain must be onboarded at Email Sending. |

Both providers can send to any recipient; only the sending domain needs verification.

#### `GET /api/health`

Health check endpoint (no auth required).

## Technology Stack

### Worker (TypeScript)

- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js
- **Language**: TypeScript
- **Validation**: Zod
- **Email Parsing**: postal-mime
- **HTML to Text**: html-to-text
- **ID Generation**: @paralleldrive/cuid2
- **Package Manager**: Bun
- **Linter/Formatter**: Biome

### CLI (Rust)

- **Language**: Rust
- **Argument Parsing**: clap
- **HTTP Client**: reqwest
- **Serialization**: serde + serde_json
- **Date/Time**: chrono

## Project Structure

```
src/                                # Cloudflare Worker
├── index.ts                        # Worker entry point (email, fetch)
├── app.ts                          # Hono app setup with auth middleware
├── env.d.ts                        # CloudflareBindings secret extensions
├── middleware/
│   └── auth.ts                     # Bearer token authentication (timing-safe)
├── routes/
│   ├── emails.ts                   # Email list, export, detail, delete, send
│   └── health.ts                   # Health check
├── database/
│   └── d1.ts                       # D1 query functions
├── handlers/
│   └── email.ts                    # Cloudflare Email Routing handler
├── providers/                      # Outbound email providers
│   ├── types.ts                    # EmailProvider interface
│   ├── resend.ts                   # Resend API provider
│   ├── cloudflare.ts               # Cloudflare Email Service provider
│   └── index.ts                    # Provider factory (dispatches by EMAIL_PROVIDER)
├── utils/
│   ├── http.ts                     # Response helpers (OK, ERR)
│   ├── mail.ts                     # Email content processing
│   └── helpers.ts                  # Utility functions
└── types.ts                        # TypeScript type definitions

rust-cli/                           # Rust CLI
└── main.rs                         # CLI entry (list, export, get, delete, health, config)

skills/mailclaw/SKILL.md            # Claude Code skill definition
install.sh                          # Cross-platform CLI install script (macOS + Linux)

sql/
├── schema.sql                      # Table definitions
└── indexes.sql                     # Index definitions

.github/workflows/
└── release-cli.yml                 # CI: build + publish CLI binaries on tag push
```

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API token"
  }
}
```

## Configuration

### Environment Variables (wrangler.jsonc `vars`)

None required for initial setup.

### Secrets (wrangler secret)

| Secret | Required | Description |
|---|---|---|
| `API_TOKEN` | Yes | Bearer token for API authentication |
| `EMAIL_PROVIDER` | No | `resend` (default) or `cloudflare` |
| `RESEND_API_KEY` | If provider = `resend` | Resend API key |

### Cloudflare Bindings

| Binding | Type | Description |
|---|---|---|
| `D1` | D1Database | Email storage database |
| `SEND_EMAIL` | SendEmail | Cloudflare Email Service binding (used by the `cloudflare` provider) |

## Rust CLI

The `mailclaw` binary wraps the REST API for terminal and AI agent use. Credentials are stored in `~/.mailclaw/config.json`.

### Commands

| Command | Description |
|---|---|
| `config set --host <URL> --api-token <TOKEN>` | Save credentials |
| `config show` | Display current config |
| `config path` | Print config file path |
| `list` | List email metadata (paginated, filterable) |
| `export` | Export emails with full content |
| `get <id>` | Get single email detail |
| `delete <id>` | Delete an email |
| `send` | Send an outbound email via the configured provider |
| `health` | Check API reachability |

All commands support `--json` for machine-readable output and `--host` / `--api-token` for one-off overrides.

## Installation

### install.sh

Cross-platform install script (`curl -fsSL .../install.sh | bash`):

- **macOS**: Installs via Homebrew (`brew tap owo-network/brew && brew install owo-network/brew/mailclaw`)
- **Linux**: Detects architecture (x86_64 / aarch64), fetches latest release from GitHub, installs to `/usr/local/bin`
- **Post-install**: Prompts user to configure host and API token interactively

### Release Automation

Pushing a `v*` tag triggers `.github/workflows/release-cli.yml`:

1. Creates GitHub Release
2. Builds CLI for 5 targets (linux x86_64/aarch64, macOS x86_64/aarch64, Windows x86_64)
3. Uploads binaries as `mailclaw-{tag}-{target}` to the release

## AI Agent Integration

The `skills/mailclaw/SKILL.md` file defines a Claude Code skill that:

- Auto-installs the CLI if missing (via `install.sh`)
- Manages config through `mailclaw config set`
- Provides natural-language access to inbox operations
