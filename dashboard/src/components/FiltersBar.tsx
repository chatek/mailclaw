import { Button, Input, SearchField } from "@heroui/react";
import { useEffect, useState } from "react";
import type { EmailFilters } from "@/types";

interface Props {
	value: EmailFilters;
	onChange: (next: EmailFilters) => void;
}

export function FiltersBar({ value, onChange }: Props) {
	const [q, setQ] = useState(value.q ?? "");
	const [from, setFrom] = useState(value.from ?? "");

	useEffect(() => {
		setQ(value.q ?? "");
		setFrom(value.from ?? "");
	}, [value.q, value.from]);

	function apply() {
		onChange({
			...value,
			q: q.trim() || undefined,
			from: from.trim() || undefined,
			offset: 0,
		});
	}

	function clear() {
		setQ("");
		setFrom("");
		onChange({ limit: value.limit, offset: 0 });
	}

	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-white px-4 py-3">
			<SearchField
				className="min-w-[220px] flex-1"
				value={q}
				onChange={setQ}
				onSubmit={apply}
			>
				<Input placeholder="Search subject, sender, body" />
			</SearchField>
			<Input
				className="w-56"
				placeholder="From: someone@example.com"
				value={from}
				onChange={(e) => setFrom((e.target as HTMLInputElement).value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") apply();
				}}
			/>
			<Button variant="secondary" onPress={apply}>
				Apply
			</Button>
			{(q || from) && (
				<Button variant="ghost" onPress={clear}>
					Clear
				</Button>
			)}
		</div>
	);
}
