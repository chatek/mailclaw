export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(ms: number): string {
	const d = new Date(ms);
	const now = new Date();
	const sameDay =
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate();
	if (sameDay) {
		return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	}
	const sameYear = d.getFullYear() === now.getFullYear();
	if (sameYear) {
		return d.toLocaleDateString([], { month: "short", day: "numeric" });
	}
	return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateLong(ms: number): string {
	return new Date(ms).toLocaleString();
}

export function initials(address: string): string {
	const name = address.split("@")[0] ?? address;
	const parts = name.split(/[._-]+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0]?.[0] ?? "";
	const second = parts[1]?.[0] ?? "";
	return (first + second).toUpperCase().slice(0, 2) || "?";
}

export function senderLabel(address: string): string {
	const match = address.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
	if (match) return match[1].trim();
	return address;
}
