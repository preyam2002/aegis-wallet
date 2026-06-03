import { describe, expect, it } from "vitest";
import {
	buildCommandMenu,
	filterCommands,
	resolveCommandExecution,
} from "./command-menu";
import { createWatchOnlyAccount } from "./wallet-workflows";

const address = `0x${"12".repeat(32)}`;

describe("command menu", () => {
	it("builds searchable wallet commands for daily-driver actions", () => {
		const menu = buildCommandMenu({ activeAccountMode: "signing" });

		expect(menu.commands.map((command) => command.id)).toEqual([
			"send",
			"receive",
			"swap",
			"stake",
			"scan-qr",
			"connect-dapp",
			"vault-mode",
			"guardian-recovery",
			"watch-only",
		]);
		expect(filterCommands(menu, "vault").map((command) => command.id)).toEqual([
			"vault-mode",
		]);
	});

	it("blocks signing commands when the active account is watch-only", () => {
		const account = createWatchOnlyAccount({
			address,
			label: "Cold vault",
			source: "manual",
		});
		const menu = buildCommandMenu({ activeAccountMode: account.mode });

		expect(resolveCommandExecution(menu, "send")).toEqual({
			status: "blocked",
			reason: "watch-only accounts cannot sign transactions",
		});
		expect(resolveCommandExecution(menu, "receive")).toEqual({
			status: "ready",
			commandId: "receive",
		});
	});
});
