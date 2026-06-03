import { describe, expect, it } from "vitest";
import {
	buildReceiveUri,
	buildSendTransaction,
	buildStakeTransaction,
	connectWalletStandardDapp,
	createNotification,
	createReceiveQrSvg,
	createSendIntent,
	createStakeIntent,
	createSwapIntent,
	createWatchOnlyAccount,
	getSendReadiness,
	getStakeReadiness,
	parseRecipientPayload,
	resolveWatchOnlySigning,
	selectPerSiteAccount,
} from "./wallet-workflows";

const address = `0x${"12".repeat(32)}`;
const other = `0x${"34".repeat(32)}`;

describe("wallet workflows", () => {
	it("builds and parses Sui receive QR payloads", () => {
		const uri = buildReceiveUri({ address, amountMist: 1_500_000_000n });

		expect(uri).toBe(`${address}?amount=1500000000`);
		expect(parseRecipientPayload(uri)).toEqual({
			address,
			amountMist: 1_500_000_000n,
		});
		expect(parseRecipientPayload(address)).toEqual({ address });
	});

	it("builds a real Sui pay QR SVG for receive", async () => {
		const qr = await createReceiveQrSvg({
			address,
			amountMist: 1_500_000_000n,
		});

		expect(qr.uri).toBe(`sui://pay?recipient=${address}&amount=1500000000`);
		expect(qr.svg).toContain("<svg");
		expect(qr.svg).toContain("</svg>");
		expect(parseRecipientPayload(qr.uri)).toEqual({
			address,
			amountMist: 1_500_000_000n,
		});
	});

	it("selects a stable per-site account and falls back to the primary account", () => {
		const account = selectPerSiteAccount("app.naviprotocol.io", [
			{ origin: "hop.ag", address: other },
			{ origin: "app.naviprotocol.io", address },
		]);

		expect(account).toBe(address);
		expect(
			selectPerSiteAccount("unknown.site", [
				{ origin: "hop.ag", address: other },
			]),
		).toBe(other);
	});

	it("creates swap and staking intents without adding wallet fees", () => {
		expect(
			createSwapIntent({
				provider: "hop",
				fromCoinType: "0x2::sui::SUI",
				toCoinType: "0xdee9::deep::DEEP",
				amountMist: 1_000_000_000n,
			}),
		).toMatchObject({ walletFeeBps: 0, provider: "hop" });

		expect(
			createStakeIntent({
				validatorAddress: other,
				amountMist: 2_000_000_000n,
			}),
		).toMatchObject({ validatorAddress: other, amountMist: 2_000_000_000n });
	});

	it("creates a native send intent and blocks invalid send readiness", () => {
		expect(
			createSendIntent({
				recipientAddress: other,
				amountMist: 42_000_000n,
			}),
		).toEqual({ recipientAddress: other, amountMist: 42_000_000n });

		expect(
			getSendReadiness({
				balanceMist: 20_000_000n,
				amountMist: 0n,
			}),
		).toEqual({
			status: "blocked",
			title: "Send amount is too small",
			detail: "Enter an amount greater than 0 SUI.",
			requiredMist: 10_000_000n,
		});

		expect(
			getSendReadiness({
				balanceMist: 5_000_000n,
				amountMist: 1_000_000n,
				gasBudgetMist: 10_000_000n,
			}),
		).toEqual({
			status: "blocked",
			title: "Not enough SUI to send",
			detail:
				"You need 0.011 SUI for the send plus estimated gas. Current balance is 0.005 SUI.",
			requiredMist: 11_000_000n,
		});

		expect(
			getSendReadiness({
				balanceMist: 12_000_000n,
				amountMist: 1_000_000n,
				gasBudgetMist: 10_000_000n,
			}),
		).toEqual({ status: "ready", requiredMist: 11_000_000n });
	});

	it("blocks staking below the protocol minimum before signing", () => {
		expect(
			getStakeReadiness({
				balanceMist: 2_000_000_000n,
				amountMist: 900_000_000n,
			}),
		).toEqual({
			status: "blocked",
			title: "Stake amount is too small",
			detail:
				"Sui requires at least 1 SUI for native staking. Increase the amount or keep the funds liquid.",
			requiredMist: 1_050_000_000n,
		});
	});

	it("blocks staking when balance cannot cover stake plus gas", () => {
		expect(
			getStakeReadiness({
				balanceMist: 291_213_410n,
				amountMist: 1_000_000_000n,
				gasBudgetMist: 50_000_000n,
			}),
		).toEqual({
			status: "blocked",
			title: "Not enough SUI to stake",
			detail:
				"You need 1.05 SUI for the stake plus estimated gas. Current balance is 0.29121341 SUI.",
			requiredMist: 1_050_000_000n,
		});
	});

	it("creates deterministic notification records for wallet actions", () => {
		expect(
			createNotification({
				id: "sign-1",
				kind: "signing",
				title: "Transaction rejected",
				detail: "recipient is not allowlisted",
			}),
		).toEqual({
			id: "sign-1",
			kind: "signing",
			title: "Transaction rejected",
			detail: "recipient is not allowlisted",
			read: false,
		});
	});

	it("creates a wallet-standard dApp session from a compatible wallet", () => {
		const session = connectWalletStandardDapp({
			origin: "https://app.naviprotocol.io",
			wallet: {
				name: "Aegis",
				features: {
					"standard:connect": {},
					"standard:disconnect": {},
					"sui:signTransaction": {},
					"sui:signAndExecuteTransaction": {},
				},
				accounts: [{ address, chains: ["sui:testnet"] }],
			},
		});

		expect(session).toEqual({
			origin: "https://app.naviprotocol.io",
			walletName: "Aegis",
			accountAddress: address,
			chains: ["sui:testnet"],
			features: [
				"standard:connect",
				"standard:disconnect",
				"sui:signAndExecuteTransaction",
				"sui:signTransaction",
			],
		});
	});

	it("creates watch-only accounts that cannot sign transactions", () => {
		const account = createWatchOnlyAccount({
			address,
			label: "Cold vault",
			source: "manual",
		});

		expect(account).toEqual({
			address,
			label: "Cold vault",
			source: "manual",
			mode: "watch-only",
			canSign: false,
		});
		expect(resolveWatchOnlySigning(account)).toEqual({
			status: "blocked",
			reason: "watch-only accounts cannot sign transactions",
		});
	});

	it("builds a native Sui staking transaction", () => {
		const tx = buildStakeTransaction({
			validatorAddress: other,
			amountMist: 2_000_000_000n,
		});
		const data = tx.getData() as {
			commands: {
				MoveCall?: { package: string; module: string; function: string };
			}[];
		};

		expect(data.commands).toHaveLength(2);
		expect(data.commands[1]?.MoveCall).toMatchObject({
			package:
				"0x0000000000000000000000000000000000000000000000000000000000000003",
			module: "sui_system",
			function: "request_add_stake",
		});
	});

	it("builds a native Sui send transaction", () => {
		const tx = buildSendTransaction({
			recipientAddress: other,
			amountMist: 42_000_000n,
		});
		const data = tx.getData() as {
			commands: {
				SplitCoins?: unknown;
				TransferObjects?: unknown;
			}[];
		};

		expect(data.commands).toHaveLength(2);
		expect(data.commands[0]?.SplitCoins).toBeDefined();
		expect(data.commands[1]?.TransferObjects).toBeDefined();
	});
});
