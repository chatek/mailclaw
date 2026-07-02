const KEY = "mailclaw.config";

export interface DashboardConfig {
	host: string;
	apiToken: string;
	defaultFrom: string;
	refreshSeconds: number;
	soundEnabled: boolean;
	notificationsEnabled: boolean;
}

const DEFAULTS: DashboardConfig = {
	host: "",
	apiToken: "",
	defaultFrom: "",
	refreshSeconds: 30,
	soundEnabled: true,
	notificationsEnabled: true,
};

export function loadConfig(): DashboardConfig {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<DashboardConfig>;
		return { ...DEFAULTS, ...parsed };
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveConfig(cfg: DashboardConfig) {
	localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearConfig() {
	localStorage.removeItem(KEY);
}

export function isConfigured(cfg: DashboardConfig): boolean {
	return cfg.apiToken.trim().length > 0;
}
