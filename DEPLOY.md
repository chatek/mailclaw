# MailClaw Deployment Guide

This guide covers deploying MailClaw in two configurations:
1. **Cloudflare Worker** - Primary API service at `api.chatek.co/mailclaw`
2. **vclaw Node Rust CLI** - Local CLI tool for admin operations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MailClaw Worker (Hono)                                  │   │
│  │  - Email receiving via Email Routing                     │   │
│  │  - REST API at api.chatek.co/mailclaw                   │   │
│  │  - D1 Database (SQLite)                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ API calls
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                     vclaw Node (Tailscale)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  mailclaw CLI (Rust binary)                              │   │
│  │  - Admin email operations                                │   │
│  │  - Local scripting and automation                        │   │
│  │  - Config: ~/.mailclaw/config.json                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Cloudflare Worker Deployment

### Prerequisites

- Cloudflare account with Workers access
- Domain `chatek.co` added to Cloudflare
- Wrangler CLI authenticated (`wrangler login`)

### Step 1: Initial Setup (One-time)

```bash
# From local machine
cd /Users/chance/Documents/Chatek/apps/chatek.co/vendors/mailclaw

# Install dependencies
bun install

# Authenticate with Cloudflare (if not already)
bunx wrangler login
```

### Step 2: Create D1 Database (One-time)

```bash
# Create the D1 database
bunx wrangler d1 create mailclaw-d1

# Output will show database_id, e.g.:
# Created new D1 database "mailclaw-d1"
# [[d1_databases]]
# binding = "D1"
# database_name = "mailclaw-d1"
# database_id = "199c8d08-98a1-46af-a9e1-2c55f3582b87"
```

The database ID is already configured in `wrangler.jsonc`.

### Step 3: Initialize Database Schema

```bash
# Create tables
bunx wrangler d1 execute mailclaw-d1 --file=sql/schema.sql

# Create indexes
bunx wrangler d1 execute mailclaw-d1 --file=sql/indexes.sql
```

### Step 4: Set Secrets

```bash
# Generate a secure API token
openssl rand -hex 32

# Set the API token as a Worker secret
bunx wrangler secret put API_TOKEN
# Paste the generated token when prompted

# Save this token securely - you'll need it for:
# - Landing page integration
# - CLI configuration on vclaw
# - AI agent skills
```

### Step 5: Deploy Worker

```bash
# Deploy to Cloudflare Workers
bun run deploy
# or: bunx wrangler deploy

# Note the Worker URL from output:
# https://mailclaw.<your-subdomain>.workers.dev
```

### Step 6: Configure Custom Domain (Optional but Recommended)

Option A: Via Cloudflare Dashboard
1. Go to Workers & Pages > mailclaw
2. Settings > Triggers > Custom Domains
3. Add: `api.chatek.co`
4. Update route prefix to `/mailclaw`

Option B: Via Wrangler
```bash
# Add custom domain to worker
bunx wrangler domains add mailclaw api.chatek.co
```

### Step 7: Configure Email Routing

1. Go to Cloudflare Dashboard > chatek.co > Email > Email Routing
2. Enable Email Routing if not already enabled
3. Go to Routing rules > Catch-all address
4. Click Edit
5. Set Action: Send to a Worker
6. Select: `mailclaw`
7. Save

All emails to `*@chatek.co` will now be received by MailClaw.

### Step 8: Verify Deployment

```bash
# Health check (no auth required)
curl https://mailclaw.<your-subdomain>.workers.dev/api/health

# Test authenticated endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://mailclaw.<your-subdomain>.workers.dev/api/emails?limit=5"
```

---

## Part 2: vclaw Node Rust CLI Deployment

### Prerequisites

- SSH access to `vclaw.ruffe-court.ts.net` via Tailscale
- Rust toolchain installed on vclaw

### Step 1: SSH to vclaw

```bash
tailscale ssh ubuntu@vclaw.ruffe-court.ts.net
```

### Step 2: Clone or Copy Repository

Option A: If repository is already on vclaw
```bash
cd /vendors/mailclaw
git pull origin main
```

Option B: Copy from local machine
```bash
# From local machine
rsync -avz --exclude 'node_modules' --exclude 'target' \
  /Users/chance/Documents/Chatek/apps/chatek.co/vendors/mailclaw/ \
  ubuntu@vclaw.ruffe-court.ts.net:/vendors/mailclaw/
```

### Step 3: Build Rust CLI

```bash
# On vclaw node
cd /vendors/mailclaw

# Build release binary (throttle parallelism for LXC)
cargo build --release -j 2

# Verify build
./target/release/mailclaw --version
# Output: mailclaw 1.0.1
```

### Step 4: Install Binary

```bash
# Option A: Install to ~/.cargo/bin (if in PATH)
cargo install --path .

# Option B: Copy to /usr/local/bin (system-wide)
sudo cp ./target/release/mailclaw /usr/local/bin/
sudo chmod +x /usr/local/bin/mailclaw

# Verify installation
which mailclaw
mailclaw --help
```

### Step 5: Configure CLI

```bash
# Create config directory
mkdir -p ~/.mailclaw

# Configure connection to Cloudflare Worker
mailclaw config set \
  --host "https://mailclaw.<your-subdomain>.workers.dev" \
  --api-token "YOUR_API_TOKEN_FROM_STEP_4"

# Or if using custom domain:
mailclaw config set \
  --host "https://api.chatek.co/mailclaw" \
  --api-token "YOUR_API_TOKEN_FROM_STEP_4"
```

### Step 6: Verify CLI Connection

```bash
# Test health endpoint
mailclaw health

# List recent emails
mailclaw list --limit 5

# Search emails
mailclaw list --q "partnership" --json
```

### Step 7: (Optional) Create systemd Service for Automation

If you need automated email processing on vclaw:

```bash
# Create systemd service file
sudo tee /etc/systemd/system/mailclaw-sync.service << 'EOF'
[Unit]
Description=MailClaw Email Sync Service
After=network.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu
ExecStart=/usr/local/bin/mailclaw list --limit 100 --json > /var/log/mailclaw/recent.json
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Create timer for periodic sync
sudo tee /etc/systemd/system/mailclaw-sync.timer << 'EOF'
[Unit]
Description=Run MailClaw sync every 5 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable mailclaw-sync.timer
sudo systemctl start mailclaw-sync.timer
```

---

## Part 3: CI/CD Deployment (GitHub Actions)

### Automated Worker Deployment

Create `.github/workflows/deploy-worker.yml`:

```yaml
name: Deploy MailClaw Worker

on:
  push:
    branches: [main]
    paths:
      - 'vendors/mailclaw/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        working-directory: vendors/mailclaw
        run: bun install

      - name: Deploy to Cloudflare Workers
        working-directory: vendors/mailclaw
        run: bunx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### GitHub Secrets Required

Set these in your GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers deployment permissions |

---

## Environment Variables Reference

### Cloudflare Worker (set via `wrangler secret`)

| Variable | Description | Example |
|----------|-------------|---------|
| `API_TOKEN` | Bearer token for API authentication | `a1b2c3d4...` (32 bytes hex) |

### Rust CLI Config (`~/.mailclaw/config.json`)

```json
{
  "host": "https://api.chatek.co/mailclaw",
  "api_token": "your-api-token-here"
}
```

---

## Troubleshooting

### Worker Deployment Issues

```bash
# Check worker logs
bunx wrangler tail

# Test local development
bun run dev

# Check D1 database
bunx wrangler d1 execute mailclaw-d1 --command="SELECT COUNT(*) FROM emails;"
```

### CLI Connection Issues

```bash
# Verify config
cat ~/.mailclaw/config.json

# Test connectivity
curl -I https://api.chatek.co/mailclaw/api/health

# Verbose output
mailclaw health --verbose
```

### Email Routing Not Working

1. Verify Email Routing is enabled in Cloudflare Dashboard
2. Check MX records are configured correctly
3. Verify catch-all action is set to Worker
4. Check worker logs for incoming emails

```bash
# Watch for incoming emails in real-time
bunx wrangler tail --format=json | jq 'select(.event.request.path == "/api/emails")'
```

---

## Quick Reference Commands

### Cloudflare Worker

```bash
cd vendors/mailclaw

# Development
bun run dev

# Deploy
bun run deploy

# View logs
bunx wrangler tail

# Set secret
bunx wrangler secret put API_TOKEN

# D1 operations
bunx wrangler d1 execute mailclaw-d1 --file=sql/schema.sql
bunx wrangler d1 query mailclaw-d1 --command="SELECT * FROM emails LIMIT 5;"
```

### vclaw CLI

```bash
# SSH to vclaw
tailscale ssh ubuntu@vclaw.ruffe-court.ts.net

# Build
cd /vendors/mailclaw
cargo build --release -j 2

# Install
cargo install --path .

# Configure
mailclaw config set --host "https://api.chatek.co/mailclaw" --api-token "xxx"

# Use
mailclaw health
mailclaw list --limit 10
mailclaw export --json
```

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-03-29  
**Maintained By:** chatek.co Team