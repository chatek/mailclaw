import {
	Button,
	Description,
	Input,
	Label,
	Modal,
	TextArea,
	TextField,
} from "@heroui/react";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api, type ClientCtx } from "@/api/client";

export interface ComposeDraft {
	to: string;
	cc?: string;
	subject: string;
	body: string;
	from?: string;
}

interface Props {
	ctx: ClientCtx;
	defaultFrom: string;
	draft: ComposeDraft | null;
	onClose: (sent?: boolean) => void;
}

export function ComposeModal({ ctx, defaultFrom, draft, onClose }: Props) {
	const isOpen = draft !== null;

	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [cc, setCc] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!draft) return;
		setFrom(draft.from || defaultFrom || "");
		setTo(draft.to || "");
		setCc(draft.cc || "");
		setSubject(draft.subject || "");
		setBody(draft.body || "");
		setError(null);
	}, [draft, defaultFrom]);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		if (!from.trim() || !to.trim() || !subject.trim() || !body.trim()) {
			setError("From, To, Subject, and Body are required");
			return;
		}
		setSending(true);
		try {
			await api.send(ctx, {
				from: from.trim(),
				to: to
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				cc: cc
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				subject: subject.trim(),
				text: body,
			});
			onClose(true);
		} catch (err) {
			const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
			setError(msg);
		} finally {
			setSending(false);
		}
	}

	return (
		<Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Modal.Container placement="center">
					<Modal.Dialog className="w-full sm:max-w-[640px]">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading>New message</Modal.Heading>
						</Modal.Header>
						<form onSubmit={handleSubmit}>
							<Modal.Body className="flex flex-col gap-3">
								<TextField name="from" value={from} onChange={setFrom} type="email" fullWidth>
									<Label>From</Label>
									<Input placeholder="me@example.com" />
								</TextField>
								<TextField name="to" value={to} onChange={setTo} fullWidth>
									<Label>To</Label>
									<Input placeholder="recipient@example.com, comma-separated" />
								</TextField>
								<TextField name="cc" value={cc} onChange={setCc} fullWidth>
									<Label>Cc (optional)</Label>
									<Input placeholder="cc@example.com" />
								</TextField>
								<TextField name="subject" value={subject} onChange={setSubject} fullWidth>
									<Label>Subject</Label>
									<Input placeholder="Subject" />
								</TextField>
								<TextField name="body" value={body} onChange={setBody} fullWidth>
									<Label>Body</Label>
									<TextArea rows={10} placeholder="Write your message…" />
									<Description>Sent as plain text.</Description>
								</TextField>
								{error ? (
									<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
										{error}
									</div>
								) : null}
							</Modal.Body>
							<Modal.Footer>
								<Button type="button" variant="tertiary" slot="close">
									Cancel
								</Button>
								<Button type="submit" isPending={sending}>
									{({ isPending }) => (isPending ? "Sending…" : "Send")}
								</Button>
							</Modal.Footer>
						</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
