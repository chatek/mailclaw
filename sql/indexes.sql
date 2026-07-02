CREATE INDEX IF NOT EXISTS idx_emails_to_received ON emails (to_address, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from_received ON emails (from_address, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_received ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments (email_id);
