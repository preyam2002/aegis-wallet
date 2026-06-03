export type CommandId =
	| "send"
	| "receive"
	| "swap"
	| "stake"
	| "scan-qr"
	| "connect-dapp"
	| "vault-mode"
	| "guardian-recovery"
	| "watch-only";

export type AccountMode = "signing" | "watch-only";

export type WalletCommand = {
	id: CommandId;
	label: string;
	keywords: string[];
	requiresSigning: boolean;
};

export type CommandMenu = {
	activeAccountMode: AccountMode;
	commands: WalletCommand[];
};

export type CommandExecution =
	| { status: "ready"; commandId: CommandId }
	| { status: "blocked"; reason: string };

export const buildCommandMenu = ({
	activeAccountMode,
}: {
	activeAccountMode: AccountMode;
}): CommandMenu => ({
	activeAccountMode,
	commands,
});

export const filterCommands = (
	menu: CommandMenu,
	query: string,
): WalletCommand[] => {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return menu.commands;
	}

	return menu.commands.filter((command) =>
		[command.id, command.label, ...command.keywords].some((candidate) =>
			candidate.toLowerCase().includes(normalized),
		),
	);
};

export const resolveCommandExecution = (
	menu: CommandMenu,
	commandId: CommandId,
): CommandExecution => {
	const command = menu.commands.find((candidate) => candidate.id === commandId);
	if (!command) {
		return { status: "blocked", reason: "unknown command" };
	}

	if (menu.activeAccountMode === "watch-only" && command.requiresSigning) {
		return {
			status: "blocked",
			reason: "watch-only accounts cannot sign transactions",
		};
	}

	return { status: "ready", commandId };
};

const commands: WalletCommand[] = [
	{
		id: "send",
		label: "Send",
		keywords: ["transfer", "pay", "recipient"],
		requiresSigning: true,
	},
	{
		id: "receive",
		label: "Receive",
		keywords: ["qr", "address"],
		requiresSigning: false,
	},
	{
		id: "swap",
		label: "Swap",
		keywords: ["trade", "aftermath", "router"],
		requiresSigning: true,
	},
	{
		id: "stake",
		label: "Stake",
		keywords: ["validator", "sui"],
		requiresSigning: true,
	},
	{
		id: "scan-qr",
		label: "Scan QR",
		keywords: ["recipient", "camera"],
		requiresSigning: false,
	},
	{
		id: "connect-dapp",
		label: "Connect dApp",
		keywords: ["wallet-standard", "session"],
		requiresSigning: false,
	},
	{
		id: "vault-mode",
		label: "Vault Mode",
		keywords: ["enclave", "policy", "co-signer"],
		requiresSigning: true,
	},
	{
		id: "guardian-recovery",
		label: "Guardian Recovery",
		keywords: ["seal", "shamir", "restore"],
		requiresSigning: true,
	},
	{
		id: "watch-only",
		label: "Watch-only Account",
		keywords: ["view", "cold", "monitor"],
		requiresSigning: false,
	},
];
