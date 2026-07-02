import { Button, Description, Input, Label, TextField } from "@heroui/react";
import { type FormEvent, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { DashboardConfig } from "@/lib/config";

interface Props {
	initial: DashboardConfig;
	onSave: (cfg: DashboardConfig) => void;
}

export function SetupScreen({ initial, onSave }: Props) {
	const [host, setHost] = useState(initial.host || window.location.origin);
	const [apiToken, setApiToken] = useState(initial.apiToken);
	const [defaultFrom, setDefaultFrom] = useState(initial.defaultFrom);
	const [testing, setTesting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		if (!apiToken.trim()) {
			setError("API token is required");
			return;
		}
		setTesting(true);
		try {
			await api.health({ host, token: apiToken });
			onSave({ ...initial, host, apiToken, defaultFrom });
		} catch (err) {
			const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
			setError(`Could not reach API — ${msg}`);
		} finally {
			setTesting(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm"
			>
				<div className="mb-6 flex items-center gap-3">
					<img src="/logo.svg" alt="MailClaw" className="h-10 w-10" />
					<div>
						<div className="text-xl font-semibold">MailClaw</div>
						<div className="text-sm text-black/60">Connect your inbox</div>
					</div>
				</div>

				<div className="flex flex-col gap-4">
					<TextField name="host" value={host} onChange={setHost} fullWidth>
						<Label>API host</Label>
						<Input placeholder="https://mailclaw.example.com" />
						<Description>Leave as-is when the dashboard is served by the Worker.</Description>
					</TextField>

					<TextField
						name="apiToken"
						value={apiToken}
						onChange={setApiToken}
						type="password"
						isRequired
						fullWidth
					>
						<Label>API token</Label>
						<Input placeholder="API_TOKEN" />
						<Description>The bearer token configured on the Worker.</Description>
					</TextField>

					<TextField
						name="defaultFrom"
						value={defaultFrom}
						onChange={setDefaultFrom}
						type="email"
						fullWidth
					>
						<Label>Default sender (optional)</Label>
						<Input placeholder="me@example.com" />
						<Description>Pre-fills the "From" field when composing.</Description>
					</TextField>

					{error ? (
						<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{error}
						</div>
					) : null}

					<Button type="submit" isPending={testing} fullWidth>
						{({ isPending }) => (isPending ? "Connecting…" : "Connect")}
					</Button>
				</div>
			</form>
		</div>
	);
}
