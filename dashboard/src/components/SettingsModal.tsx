import {
	Button,
	Description,
	Input,
	Label,
	Modal,
	NumberField,
	Switch,
	TextField,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { clearConfig, type DashboardConfig } from "@/lib/config";
import {
	notificationPermission,
	requestNotificationPermission,
} from "@/lib/notify";

interface Props {
	isOpen: boolean;
	config: DashboardConfig;
	onClose: () => void;
	onSave: (cfg: DashboardConfig) => void;
	onSignOut: () => void;
}

export function SettingsModal({ isOpen, config, onClose, onSave, onSignOut }: Props) {
	const [refreshSeconds, setRefreshSeconds] = useState(config.refreshSeconds);
	const [soundEnabled, setSoundEnabled] = useState(config.soundEnabled);
	const [notificationsEnabled, setNotificationsEnabled] = useState(
		config.notificationsEnabled,
	);
	const [defaultFrom, setDefaultFrom] = useState(config.defaultFrom);
	const [host, setHost] = useState(config.host);
	const [permission, setPermission] = useState(notificationPermission());

	useEffect(() => {
		if (!isOpen) return;
		setRefreshSeconds(config.refreshSeconds);
		setSoundEnabled(config.soundEnabled);
		setNotificationsEnabled(config.notificationsEnabled);
		setDefaultFrom(config.defaultFrom);
		setHost(config.host);
		setPermission(notificationPermission());
	}, [isOpen, config]);

	async function handleEnableNotifications(value: boolean) {
		setNotificationsEnabled(value);
		if (value && permission === "default") {
			const result = await requestNotificationPermission();
			setPermission(result);
			if (result !== "granted") {
				setNotificationsEnabled(false);
			}
		}
	}

	function save() {
		onSave({
			...config,
			host,
			defaultFrom,
			refreshSeconds: Math.max(0, Math.min(refreshSeconds || 0, 600)),
			soundEnabled,
			notificationsEnabled,
		});
		onClose();
	}

	function signOut() {
		clearConfig();
		onSignOut();
	}

	return (
		<Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Modal.Container placement="center">
					<Modal.Dialog className="w-full sm:max-w-[520px]">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading>Settings</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="flex flex-col gap-4">
							<TextField name="host" value={host} onChange={setHost} fullWidth>
								<Label>API host</Label>
								<Input placeholder="https://mailclaw.example.com" />
							</TextField>
							<TextField
								name="defaultFrom"
								value={defaultFrom}
								onChange={setDefaultFrom}
								type="email"
								fullWidth
							>
								<Label>Default sender</Label>
								<Input placeholder="me@example.com" />
							</TextField>

							<NumberField
								value={refreshSeconds}
								onChange={(v) => setRefreshSeconds(Number.isNaN(v) ? 0 : v)}
								minValue={0}
								maxValue={600}
							>
								<Label>Auto-refresh interval (seconds)</Label>
								<Input />
								<Description>Set to 0 to disable polling.</Description>
							</NumberField>

							<div className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
								<div>
									<div className="text-sm font-medium">Sound on new email</div>
									<div className="text-xs text-black/55">
										Plays a short chime when new mail arrives.
									</div>
								</div>
								<Switch isSelected={soundEnabled} onChange={setSoundEnabled} />
							</div>

							<div className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
								<div>
									<div className="text-sm font-medium">Browser notifications</div>
									<div className="text-xs text-black/55">
										Permission: <strong>{permission}</strong>
										{permission === "denied"
											? " — enable it in your browser settings."
											: ""}
									</div>
								</div>
								<Switch
									isSelected={notificationsEnabled && permission === "granted"}
									isDisabled={permission === "denied" || permission === "unsupported"}
									onChange={handleEnableNotifications}
								/>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button variant="danger" onPress={signOut}>
								Sign out
							</Button>
							<Button variant="tertiary" slot="close">
								Cancel
							</Button>
							<Button onPress={save}>Save</Button>
						</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
