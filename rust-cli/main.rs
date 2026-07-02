use std::{
    fs,
    path::PathBuf,
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use chrono::{DateTime, Utc};
use clap::{Args, Parser, Subcommand};
use reqwest::{Method, blocking::Client};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

const CONFIG_DIR_NAME: &str = ".mailclaw";
const CONFIG_FILE_NAME: &str = "config.json";

fn main() {
    if let Err(error) = run() {
        eprintln!("Error: {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Config { command } => match command {
            ConfigCommand::Path(args) => {
                let path = config_path()?;
                if args.json {
                    print_json(&ConfigPathOutput {
                        path: path.display().to_string(),
                    })?;
                } else {
                    println!("{}", path.display());
                }
            }
            ConfigCommand::Show(args) => {
                let path = config_path()?;
                let stored = load_stored_config()?;
                let output = ConfigShowOutput {
                    path: path.display().to_string(),
                    configured: stored.is_some(),
                    host: stored.as_ref().map(|config| config.host.clone()),
                    api_token_present: stored.is_some(),
                    masked_api_token: stored.as_ref().map(|config| mask_secret(&config.api_token)),
                };

                if args.json {
                    print_json(&output)?;
                } else {
                    println!("Path: {}", output.path);
                    println!(
                        "Configured: {}",
                        if output.configured { "yes" } else { "no" }
                    );

                    if let Some(host) = output.host {
                        println!("Host: {host}");
                    }

                    if let Some(masked) = output.masked_api_token {
                        println!("API token: {masked}");
                    }
                }
            }
            ConfigCommand::Set(args) => {
                let stored = StoredConfig {
                    host: normalize_host(&args.host)?,
                    api_token: normalize_secret(&args.api_token)?,
                };
                let path = save_stored_config(&stored)?;
                let output = ConfigSetOutput {
                    path: path.display().to_string(),
                    host: stored.host,
                };

                if args.output.json {
                    print_json(&output)?;
                } else {
                    println!("Saved config to {}", output.path);
                    println!("Host: {}", output.host);
                }
            }
        },
        Command::Health(args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let health: HealthResponse = client.get("api/health", &[], false)?;

            if args.json {
                print_json(&health)?;
            } else {
                println!("Status: {}", health.status);
                println!("Timestamp: {}", format_millis(health.timestamp));
            }
        }
        Command::List(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let response: PaginatedEmails<Email> =
                client.get("api/emails", &args.filters.to_query_pairs(), true)?;

            if args.output.json {
                print_json(&response)?;
            } else {
                print_email_page(&response, false);
            }
        }
        Command::Export(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let response: PaginatedEmails<Email> =
                client.get("api/emails/export", &args.filters.to_query_pairs(), true)?;

            if args.output.json {
                print_json(&response)?;
            } else {
                print_email_page(&response, true);
            }
        }
        Command::Get(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let email: Email = client.get(&format!("api/emails/{}", args.id), &[], true)?;

            if args.output.json {
                print_json(&email)?;
            } else {
                print_email_detail(&email);
            }
        }
        Command::Delete(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let response: DeleteResponse =
                client.delete(&format!("api/emails/{}", args.id), true)?;

            if args.output.json {
                print_json(&response)?;
            } else {
                println!("{}", response.message);
            }
        }
        Command::Send(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;

            let body = SendEmailBody {
                from: args.from.clone(),
                to: args.to.clone(),
                subject: args.subject.clone(),
                html: args.html.clone(),
                text: args.text.clone(),
                cc: args.cc.clone().unwrap_or_default(),
                bcc: args.bcc.clone().unwrap_or_default(),
                reply_to: args.reply_to.clone().unwrap_or_default(),
            };

            let response: SendEmailResponse = client.post("api/emails/send", &body, true)?;

            if args.output.json {
                print_json(&response)?;
            } else {
                println!("Email sent successfully");
                println!("  id: {}", response.id);
                println!("  provider: {}", response.provider);
            }
        }
        Command::Attachments(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let response: AttachmentList = client.get(
                &format!("api/emails/{}/attachments", args.id),
                &[],
                true,
            )?;

            if args.output.json {
                print_json(&response)?;
            } else {
                print_attachment_list(&response);
            }
        }
        Command::Download(ref args) => {
            let settings = Settings::load(&cli)?;
            let client = ApiClient::new(settings)?;
            let download = client.download(&format!(
                "api/emails/{}/attachments/{}",
                args.email_id, args.attachment_id
            ))?;

            let target = match &args.output {
                Some(path) => path.clone(),
                None => PathBuf::from(
                    download
                        .filename
                        .clone()
                        .unwrap_or_else(|| args.attachment_id.clone()),
                ),
            };

            fs::write(&target, &download.bytes).with_context(|| {
                format!("failed to write attachment to {}", target.display())
            })?;

            if args.json {
                print_json(&DownloadOutput {
                    path: target.display().to_string(),
                    size: download.bytes.len() as u64,
                    content_type: download.content_type.clone(),
                })?;
            } else {
                println!(
                    "Saved {} ({})",
                    target.display(),
                    format_bytes(download.bytes.len() as u64)
                );
            }
        }
    }

    Ok(())
}

#[derive(Parser, Debug)]
#[command(
    name = "mailclaw",
    version,
    about = "Binary CLI for the MailClaw inbox API",
    arg_required_else_help = true
)]
struct Cli {
    #[arg(long, global = true, env = "MAILCLAW_HOST")]
    host: Option<String>,

    #[arg(long = "api-token", global = true, env = "MAILCLAW_API_TOKEN")]
    api_token: Option<String>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Manage MailClaw CLI configuration.
    Config {
        #[command(subcommand)]
        command: ConfigCommand,
    },
    /// Check whether the MailClaw API is reachable.
    Health(OutputArgs),
    /// List email metadata without full bodies.
    List(QueryArgs),
    /// Export emails with full body content.
    Export(QueryArgs),
    /// Fetch one email by ID.
    Get(GetArgs),
    /// Delete one email by ID.
    Delete(DeleteArgs),
    /// Send an email via the configured provider.
    Send(SendArgs),
    /// List attachment metadata for an email.
    Attachments(AttachmentsArgs),
    /// Download a single attachment to a file.
    Download(DownloadArgs),
}

#[derive(Subcommand, Debug)]
enum ConfigCommand {
    /// Print the path to the MailClaw config file.
    Path(OutputArgs),
    /// Show the current MailClaw config state.
    Show(OutputArgs),
    /// Save the MailClaw host and API token.
    Set(SetArgs),
}

#[derive(Args, Debug, Clone, Copy)]
struct OutputArgs {
    #[arg(long)]
    json: bool,
}

#[derive(Args, Debug)]
struct SetArgs {
    #[arg(long)]
    host: String,

    #[arg(long = "api-token")]
    api_token: String,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug, Clone)]
struct QueryArgs {
    #[command(flatten)]
    filters: FilterArgs,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug)]
struct GetArgs {
    id: String,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug)]
struct DeleteArgs {
    id: String,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug)]
struct AttachmentsArgs {
    /// Email ID.
    id: String,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug)]
struct DownloadArgs {
    /// Email ID.
    email_id: String,

    /// Attachment ID (from `mailclaw attachments <email_id>`).
    attachment_id: String,

    /// Output file path. Defaults to the attachment's original filename
    /// in the current directory.
    #[arg(short, long)]
    output: Option<PathBuf>,

    #[arg(long)]
    json: bool,
}

#[derive(Args, Debug)]
struct SendArgs {
    /// Sender email address (e.g. "Name <user@example.com>")
    #[arg(long)]
    from: String,

    /// Recipient email address(es), can be specified multiple times
    #[arg(long, required = true, num_args = 1..)]
    to: Vec<String>,

    /// Email subject
    #[arg(long)]
    subject: String,

    /// HTML body content
    #[arg(long)]
    html: Option<String>,

    /// Plain text body content
    #[arg(long)]
    text: Option<String>,

    /// CC recipient(s), can be specified multiple times
    #[arg(long, num_args = 1..)]
    cc: Option<Vec<String>>,

    /// BCC recipient(s), can be specified multiple times
    #[arg(long, num_args = 1..)]
    bcc: Option<Vec<String>>,

    /// Reply-to address(es), can be specified multiple times
    #[arg(long = "reply-to", num_args = 1..)]
    reply_to: Option<Vec<String>>,

    #[command(flatten)]
    output: OutputArgs,
}

#[derive(Args, Debug, Clone)]
struct FilterArgs {
    #[arg(long)]
    from: Option<String>,

    #[arg(long)]
    to: Option<String>,

    #[arg(long)]
    q: Option<String>,

    #[arg(long)]
    after: Option<String>,

    #[arg(long)]
    before: Option<String>,

    #[arg(long, default_value_t = 20)]
    limit: u32,

    #[arg(long, default_value_t = 0)]
    offset: u32,
}

impl FilterArgs {
    fn to_query_pairs(&self) -> Vec<(String, String)> {
        let mut pairs = vec![
            ("limit".to_string(), self.limit.to_string()),
            ("offset".to_string(), self.offset.to_string()),
        ];

        if let Some(value) = &self.from {
            pairs.push(("from".to_string(), value.clone()));
        }
        if let Some(value) = &self.to {
            pairs.push(("to".to_string(), value.clone()));
        }
        if let Some(value) = &self.q {
            pairs.push(("q".to_string(), value.clone()));
        }
        if let Some(value) = &self.after {
            pairs.push(("after".to_string(), value.clone()));
        }
        if let Some(value) = &self.before {
            pairs.push(("before".to_string(), value.clone()));
        }

        pairs
    }
}

#[derive(Debug, Clone)]
struct Settings {
    host: String,
    api_token: Option<String>,
}

impl Settings {
    fn load(cli: &Cli) -> Result<Self> {
        let stored = load_stored_config()?;
        let host = cli
            .host
            .clone()
            .or_else(|| stored.as_ref().map(|config| config.host.clone()))
            .ok_or_else(|| missing_config_error("host"))?;

        let api_token = cli
            .api_token
            .clone()
            .or_else(|| stored.as_ref().map(|config| config.api_token.clone()));

        Ok(Self {
            host: normalize_host(&host)?,
            api_token: api_token
                .map(|token| normalize_secret(&token))
                .transpose()?,
        })
    }

    fn require_api_token(&self) -> Result<&str> {
        self.api_token
            .as_deref()
            .ok_or_else(|| missing_config_error("api token"))
    }
}

struct ApiClient {
    http: Client,
    settings: Settings,
}

impl ApiClient {
    fn new(settings: Settings) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(format!("mailclaw-cli/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .context("failed to create HTTP client")?;

        Ok(Self { http, settings })
    }

    fn get<T>(&self, path: &str, query: &[(String, String)], auth: bool) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request(Method::GET, path, query, auth)
    }

    fn post<T, B>(&self, path: &str, body: &B, auth: bool) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize,
    {
        self.request_with_body(Method::POST, path, body, auth)
    }

    fn delete<T>(&self, path: &str, auth: bool) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request(Method::DELETE, path, &[], auth)
    }

    fn request<T>(
        &self,
        method: Method,
        path: &str,
        query: &[(String, String)],
        auth: bool,
    ) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = format!("{}/{}", self.settings.host, path.trim_start_matches('/'));
        let mut request = self.http.request(method, &url).query(query);

        if auth {
            request = request.bearer_auth(self.settings.require_api_token()?);
        }

        self.send_and_parse(request, &url)
    }

    fn request_with_body<T, B>(
        &self,
        method: Method,
        path: &str,
        body: &B,
        auth: bool,
    ) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize,
    {
        let url = format!("{}/{}", self.settings.host, path.trim_start_matches('/'));
        let mut request = self.http.request(method, &url).json(body);

        if auth {
            request = request.bearer_auth(self.settings.require_api_token()?);
        }

        self.send_and_parse(request, &url)
    }

    fn download(&self, path: &str) -> Result<DownloadResult> {
        let url = format!("{}/{}", self.settings.host, path.trim_start_matches('/'));
        let response = self
            .http
            .get(&url)
            .bearer_auth(self.settings.require_api_token()?)
            .send()
            .with_context(|| format!("request failed: {url}"))?;

        let status = response.status();
        let content_type = header_value(&response, "content-type");
        let filename = response
            .headers()
            .get("content-disposition")
            .and_then(|value| value.to_str().ok())
            .and_then(parse_content_disposition_filename);

        let bytes = response
            .bytes()
            .with_context(|| format!("failed to read response body from {url}"))?
            .to_vec();

        if status.is_success() {
            return Ok(DownloadResult {
                bytes,
                filename,
                content_type,
            });
        }

        // Error responses still come back as the JSON envelope.
        if let Ok(envelope) = serde_json::from_slice::<ApiEnvelope<serde_json::Value>>(&bytes) {
            if let Some(error) = envelope.error {
                bail!("API error [{}]: {}", error.code, error.message);
            }
        }

        bail!("API request failed with status {status}");
    }

    fn send_and_parse<T>(&self, request: reqwest::blocking::RequestBuilder, url: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let response = request
            .send()
            .with_context(|| format!("request failed: {url}"))?;
        let status = response.status();
        let body = response
            .text()
            .with_context(|| format!("failed to read response body from {url}"))?;

        let envelope: ApiEnvelope<T> = serde_json::from_str(&body).with_context(|| {
            format!(
                "failed to parse API response from {url}: {}",
                truncate(&body, 400)
            )
        })?;

        if status.is_success() && envelope.success {
            return envelope
                .data
                .ok_or_else(|| anyhow!("API response was missing data"));
        }

        if let Some(error) = envelope.error {
            bail!("API error [{}]: {}", error.code, error.message);
        }

        bail!("API request failed with status {}", status);
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredConfig {
    host: String,
    api_token: String,
}

#[derive(Debug, Serialize)]
struct ConfigPathOutput {
    path: String,
}

#[derive(Debug, Serialize)]
struct ConfigShowOutput {
    path: String,
    configured: bool,
    host: Option<String>,
    api_token_present: bool,
    masked_api_token: Option<String>,
}

#[derive(Debug, Serialize)]
struct ConfigSetOutput {
    path: String,
    host: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiEnvelope<T> {
    success: bool,
    data: Option<T>,
    error: Option<ApiError>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiError {
    code: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    status: String,
    timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaginatedEmails<T> {
    emails: Vec<T>,
    total: u32,
    limit: u32,
    offset: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Email {
    id: String,
    from_address: String,
    to_address: String,
    subject: Option<String>,
    received_at: i64,
    #[serde(default)]
    html_content: Option<String>,
    #[serde(default)]
    text_content: Option<String>,
    has_attachments: bool,
    attachment_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteResponse {
    message: String,
}

#[derive(Debug, Serialize)]
struct SendEmailBody {
    from: String,
    to: Vec<String>,
    subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    cc: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    bcc: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    reply_to: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SendEmailResponse {
    id: String,
    provider: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentList {
    attachments: Vec<AttachmentMeta>,
    total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentMeta {
    id: String,
    email_id: String,
    #[serde(default)]
    filename: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    size: u64,
    created_at: i64,
}

struct DownloadResult {
    bytes: Vec<u8>,
    filename: Option<String>,
    content_type: Option<String>,
}

#[derive(Debug, Serialize)]
struct DownloadOutput {
    path: String,
    size: u64,
    content_type: Option<String>,
}

fn config_path() -> Result<PathBuf> {
    let home = user_home_dir()?;
    Ok(home.join(CONFIG_DIR_NAME).join(CONFIG_FILE_NAME))
}

fn user_home_dir() -> Result<PathBuf> {
    if let Some(home) = std::env::var_os("HOME") {
        return Ok(PathBuf::from(home));
    }

    #[cfg(windows)]
    {
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return Ok(PathBuf::from(profile));
        }

        let home_drive = std::env::var_os("HOMEDRIVE");
        let home_path = std::env::var_os("HOMEPATH");
        if let (Some(drive), Some(path)) = (home_drive, home_path) {
            return Ok(PathBuf::from(format!(
                "{}{}",
                drive.to_string_lossy(),
                path.to_string_lossy()
            )));
        }
    }

    bail!("could not determine the user home directory")
}

fn load_stored_config() -> Result<Option<StoredConfig>> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)
        .with_context(|| format!("failed to read config file {}", path.display()))?;
    let config: StoredConfig = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse config file {}", path.display()))?;

    Ok(Some(config))
}

fn save_stored_config(config: &StoredConfig) -> Result<PathBuf> {
    let path = config_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("invalid config path {}", path.display()))?;
    fs::create_dir_all(parent)
        .with_context(|| format!("failed to create config directory {}", parent.display()))?;

    let content = serde_json::to_string_pretty(config).context("failed to serialize config")?;
    fs::write(&path, format!("{content}\n"))
        .with_context(|| format!("failed to write config file {}", path.display()))?;

    Ok(path)
}

fn print_json<T>(value: &T) -> Result<()>
where
    T: Serialize,
{
    println!(
        "{}",
        serde_json::to_string_pretty(value).context("failed to render JSON output")?
    );
    Ok(())
}

fn print_email_page(page: &PaginatedEmails<Email>, include_body: bool) {
    println!(
        "Showing {} emails (total {}, limit {}, offset {})",
        page.emails.len(),
        page.total,
        page.limit,
        page.offset
    );

    for email in &page.emails {
        println!();
        print_email_summary(email);

        if include_body {
            let body = preferred_body(email).unwrap_or("[no body content]");
            println!();
            println!("{}", truncate(body, 400));
        }
    }
}

fn print_email_summary(email: &Email) {
    println!("{}", email.subject.as_deref().unwrap_or("(no subject)"));
    println!("  id: {}", email.id);
    println!("  from: {}", email.from_address);
    println!("  to: {}", email.to_address);
    println!("  received: {}", format_seconds(email.received_at));
    println!(
        "  attachments: {} ({})",
        if email.has_attachments { "yes" } else { "no" },
        email.attachment_count
    );
}

fn print_email_detail(email: &Email) {
    print_email_summary(email);
    println!();
    println!("Text content:");
    println!("{}", preferred_body(email).unwrap_or("[no body content]"));
}

fn preferred_body(email: &Email) -> Option<&str> {
    email
        .text_content
        .as_deref()
        .filter(|text| !text.trim().is_empty())
        .or_else(|| {
            email
                .html_content
                .as_deref()
                .filter(|html| !html.trim().is_empty())
        })
}

fn print_attachment_list(list: &AttachmentList) {
    println!("{} attachment(s)", list.total);
    for attachment in &list.attachments {
        println!();
        println!("{}", attachment.filename.as_deref().unwrap_or("(no name)"));
        println!("  id: {}", attachment.id);
        println!(
            "  type: {}",
            attachment.mime_type.as_deref().unwrap_or("unknown")
        );
        println!("  size: {}", format_bytes(attachment.size));
        println!("  created: {}", format_seconds(attachment.created_at));
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit = 0;
    while size >= 1024.0 && unit < UNITS.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{size:.1} {}", UNITS[unit])
    }
}

fn header_value(response: &reqwest::blocking::Response, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}

/// Extracts a filename from a Content-Disposition header, preferring the
/// RFC 5987 `filename*=UTF-8''` form over the plain `filename=` form.
fn parse_content_disposition_filename(header: &str) -> Option<String> {
    for part in header.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix("filename*=") {
            let value = value.trim();
            if let Some(encoded) = value.strip_prefix("UTF-8''").or_else(|| {
                value
                    .strip_prefix("utf-8''")
                    .or_else(|| value.strip_prefix("''"))
            }) {
                return Some(percent_decode(encoded.trim_matches('"')));
            }
        }
    }

    for part in header.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix("filename=") {
            let name = value.trim().trim_matches('"');
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }

    None
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn format_seconds(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp, 0)
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| timestamp.to_string())
}

fn format_millis(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(timestamp)
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| timestamp.to_string())
}

fn normalize_host(value: &str) -> Result<String> {
    let trimmed = value.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        bail!("host cannot be empty");
    }

    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        bail!("host must start with http:// or https://");
    }

    Ok(trimmed)
}

fn normalize_secret(value: &str) -> Result<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        bail!("api token cannot be empty");
    }
    Ok(trimmed)
}

fn missing_config_error(field: &str) -> anyhow::Error {
    anyhow!(
        "missing MailClaw {field}; run `mailclaw config set --host <HOST> --api-token <TOKEN>` or pass --{}",
        field.replace(' ', "-")
    )
}

fn mask_secret(secret: &str) -> String {
    if secret.len() <= 8 {
        return "*".repeat(secret.len());
    }

    format!("{}…{}", &secret[..4], &secret[secret.len() - 4..])
}

fn truncate(value: &str, max_chars: usize) -> String {
    let shortened: String = value.chars().take(max_chars).collect();
    if value.chars().count() > max_chars {
        format!("{shortened}...")
    } else {
        shortened
    }
}
