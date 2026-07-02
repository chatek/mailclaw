// Short pleasant two-tone chime, generated via WebAudio so we ship no audio asset.
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (typeof window === "undefined") return null;
	if (audioCtx) return audioCtx;
	const Ctor =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	audioCtx = new Ctor();
	return audioCtx;
}

export function playChime() {
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === "suspended") void ctx.resume();
	const now = ctx.currentTime;
	const tones = [
		{ freq: 880, start: 0, dur: 0.18 },
		{ freq: 1320, start: 0.18, dur: 0.22 },
	];
	for (const t of tones) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = t.freq;
		gain.gain.setValueAtTime(0, now + t.start);
		gain.gain.linearRampToValueAtTime(0.15, now + t.start + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now + t.start);
		osc.stop(now + t.start + t.dur + 0.02);
	}
}

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export function notificationPermission(): NotifPermission {
	if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
	return Notification.permission as NotifPermission;
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
	if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
	if (Notification.permission === "granted" || Notification.permission === "denied") {
		return Notification.permission as NotifPermission;
	}
	const result = await Notification.requestPermission();
	return result as NotifPermission;
}

export function showNotification(title: string, body: string, onClick?: () => void) {
	if (typeof window === "undefined" || !("Notification" in window)) return;
	if (Notification.permission !== "granted") return;
	try {
		const n = new Notification(title, { body, icon: "/favicon.svg" });
		if (onClick) {
			n.onclick = () => {
				window.focus();
				onClick();
				n.close();
			};
		}
	} catch {
		// some browsers throw if site isn't a secure context
	}
}
