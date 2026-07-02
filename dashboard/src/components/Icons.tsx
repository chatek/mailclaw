import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
	width: 18,
	height: 18,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

export function MailIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="m3 7 9 6 9-6" />
		</svg>
	);
}

export function RefreshIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
			<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
			<path d="M21 3v5h-5" />
			<path d="M3 21v-5h5" />
		</svg>
	);
}

export function SearchIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.5-3.5" />
		</svg>
	);
}

export function TrashIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M3 6h18" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
		</svg>
	);
}

export function PencilIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

export function GearIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.4l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
		</svg>
	);
}

export function DownloadIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<path d="M7 10l5 5 5-5" />
			<path d="M12 15V3" />
		</svg>
	);
}

export function PaperclipIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M21.4 11 12.3 20a5.5 5.5 0 0 1-7.8-7.8l9.2-9.1a3.6 3.6 0 0 1 5.2 5.2l-9.2 9.1a1.8 1.8 0 1 1-2.6-2.6l8.4-8.4" />
		</svg>
	);
}

export function ArrowLeftIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M19 12H5" />
			<path d="m12 19-7-7 7-7" />
		</svg>
	);
}

export function ReplyIcon(props: IconProps) {
	return (
		<svg {...base} {...props} aria-hidden="true">
			<path d="M9 17 4 12l5-5" />
			<path d="M4 12h10a6 6 0 0 1 6 6v2" />
		</svg>
	);
}
