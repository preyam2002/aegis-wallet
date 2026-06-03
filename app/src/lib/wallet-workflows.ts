import { Transaction } from "@mysten/sui/transactions";
import QRCode from "qrcode";

export type ReceivePayload = {
	address: string;
	amountMist?: bigint;
};

export type ReceiveQrSvg = ReceivePayload & {
	uri: string;
	svg: string;
};

export type ReceiveQrOptions = {
	width?: number;
};

export type PerSiteAccount = {
	origin: string;
	address: string;
};

export type SwapIntent = {
	provider: "hop" | "cetus" | "aftermath";
	fromCoinType: string;
	toCoinType: string;
	amountMist: bigint;
	walletFeeBps: 0;
};

export type SendIntent = {
	recipientAddress: string;
	amountMist: bigint;
};

export type SendReadinessInput = {
	balanceMist: bigint;
	amountMist: bigint;
	gasBudgetMist?: bigint;
};

export type SendReadiness =
	| {
			status: "ready";
			requiredMist: bigint;
	  }
	| {
			status: "blocked";
			title: string;
			detail: string;
			requiredMist: bigint;
	  };

export type StakeIntent = {
	validatorAddress: string;
	amountMist: bigint;
};

export type StakeReadinessInput = {
	balanceMist: bigint;
	amountMist: bigint;
	gasBudgetMist?: bigint;
};

export type StakeReadiness =
	| {
			status: "ready";
			requiredMist: bigint;
	  }
	| {
			status: "blocked";
			title: string;
			detail: string;
			requiredMist: bigint;
	  };

export type WalletStandardLike = {
	name: string;
	features: Record<string, unknown>;
	accounts: { address: string; chains?: string[] }[];
};

export type DappConnectionSession = {
	origin: string;
	walletName: string;
	accountAddress: string;
	chains: string[];
	features: string[];
};

export type WatchOnlyAccount = {
	mode: "watch-only";
	address: string;
	label: string;
	source: "manual" | "address-book" | "explorer";
	canSign: false;
};

export type WatchOnlySigningResolution = {
	status: "blocked";
	reason: string;
};

export type WalletNotification = {
	id: string;
	kind: "signing" | "send" | "swap" | "stake" | "recovery" | "vault";
	title: string;
	detail: string;
	read: boolean;
};

export const buildReceiveUri = ({
	address,
	amountMist,
}: ReceivePayload): string => {
	assertAddress(address);
	return amountMist === undefined
		? address
		: `${address}?amount=${amountMist.toString()}`;
};

export const buildSuiPayUri = ({
	address,
	amountMist,
}: ReceivePayload): string => {
	assertAddress(address);
	const params = new URLSearchParams({ recipient: address });
	if (amountMist !== undefined) {
		params.set("amount", amountMist.toString());
	}

	return `sui://pay?${params.toString()}`;
};

export const createReceiveQrSvg = async (
	payload: ReceivePayload,
	{ width = 192 }: ReceiveQrOptions = {},
): Promise<ReceiveQrSvg> => {
	const uri = buildSuiPayUri(payload);
	const svg = await QRCode.toString(uri, {
		errorCorrectionLevel: "M",
		margin: 1,
		type: "svg",
		width,
	});

	return {
		...payload,
		uri,
		svg,
	};
};

export const parseRecipientPayload = (payload: string): ReceivePayload => {
	const normalized = payload.trim();
	if (normalized.startsWith("sui://pay")) {
		const url = new URL(normalized);
		const recipient = url.searchParams.get("recipient");
		if (!recipient) {
			throw new Error("expected Sui pay QR recipient");
		}
		assertAddress(recipient);

		const amount = url.searchParams.get("amount");
		return {
			address: recipient,
			...(amount ? { amountMist: BigInt(amount) } : {}),
		};
	}

	const [address, query = ""] = normalized.replace(/^sui:/, "").split("?");
	assertAddress(address);

	const params = new URLSearchParams(query);
	const amount = params.get("amount");
	return {
		address,
		...(amount ? { amountMist: BigInt(amount) } : {}),
	};
};

export const selectPerSiteAccount = (
	origin: string,
	accounts: PerSiteAccount[],
): string | null =>
	accounts.find((account) => account.origin === origin)?.address ??
	accounts[0]?.address ??
	null;

export const createSwapIntent = (
	input: Omit<SwapIntent, "walletFeeBps">,
): SwapIntent => ({
	...input,
	walletFeeBps: 0,
});

export const createSendIntent = (input: SendIntent): SendIntent => {
	assertAddress(input.recipientAddress);
	return input;
};

export const getSendReadiness = ({
	balanceMist,
	amountMist,
	gasBudgetMist = DEFAULT_SEND_GAS_BUDGET_MIST,
}: SendReadinessInput): SendReadiness => {
	const requiredMist = amountMist + gasBudgetMist;
	if (amountMist <= 0n) {
		return {
			status: "blocked",
			title: "Send amount is too small",
			detail: "Enter an amount greater than 0 SUI.",
			requiredMist: gasBudgetMist,
		};
	}

	if (balanceMist < requiredMist) {
		return {
			status: "blocked",
			title: "Not enough SUI to send",
			detail: `You need ${formatMist(requiredMist)} for the send plus estimated gas. Current balance is ${formatMist(balanceMist)}.`,
			requiredMist,
		};
	}

	return {
		status: "ready",
		requiredMist,
	};
};

export const buildSendTransaction = ({
	recipientAddress,
	amountMist,
}: SendIntent): Transaction => {
	assertAddress(recipientAddress);
	if (amountMist <= 0n) {
		throw new Error("send amount must be positive");
	}

	const tx = new Transaction();
	const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
	tx.transferObjects([coin], tx.pure.address(recipientAddress));
	return tx;
};

export const createStakeIntent = (input: StakeIntent): StakeIntent => {
	assertAddress(input.validatorAddress);
	return input;
};

export const getStakeReadiness = ({
	balanceMist,
	amountMist,
	gasBudgetMist = DEFAULT_STAKE_GAS_BUDGET_MIST,
}: StakeReadinessInput): StakeReadiness => {
	const requiredMist = MIN_STAKE_MIST + gasBudgetMist;
	if (amountMist < MIN_STAKE_MIST) {
		return {
			status: "blocked",
			title: "Stake amount is too small",
			detail:
				"Sui requires at least 1 SUI for native staking. Increase the amount or keep the funds liquid.",
			requiredMist,
		};
	}

	const spendMist = amountMist + gasBudgetMist;
	if (balanceMist < spendMist) {
		return {
			status: "blocked",
			title: "Not enough SUI to stake",
			detail: `You need ${formatMist(spendMist)} for the stake plus estimated gas. Current balance is ${formatMist(balanceMist)}.`,
			requiredMist: spendMist,
		};
	}

	return {
		status: "ready",
		requiredMist: spendMist,
	};
};

export const buildStakeTransaction = ({
	validatorAddress,
	amountMist,
}: StakeIntent): Transaction => {
	assertAddress(validatorAddress);
	const tx = new Transaction();
	const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
	tx.moveCall({
		target: "0x3::sui_system::request_add_stake",
		arguments: [
			tx.object.system({ mutable: true }),
			stakeCoin,
			tx.pure.address(validatorAddress),
		],
	});
	return tx;
};

export const connectWalletStandardDapp = ({
	origin,
	wallet,
	preferredAddress,
}: {
	origin: string;
	wallet: WalletStandardLike;
	preferredAddress?: string;
}): DappConnectionSession => {
	const requiredFeatures = [
		"standard:connect",
		"sui:signTransaction",
		"sui:signAndExecuteTransaction",
	];
	for (const feature of requiredFeatures) {
		if (!(feature in wallet.features)) {
			throw new Error(`wallet is missing ${feature}`);
		}
	}

	const account =
		wallet.accounts.find(
			(candidate) => candidate.address === preferredAddress,
		) ?? wallet.accounts[0];
	if (!account) {
		throw new Error("wallet returned no accounts");
	}
	assertAddress(account.address);

	return {
		origin,
		walletName: wallet.name,
		accountAddress: account.address,
		chains: account.chains ?? [],
		features: Object.keys(wallet.features).sort(),
	};
};

export const createWatchOnlyAccount = ({
	address,
	label,
	source,
}: Pick<
	WatchOnlyAccount,
	"address" | "label" | "source"
>): WatchOnlyAccount => {
	assertAddress(address);
	return {
		mode: "watch-only",
		address,
		label,
		source,
		canSign: false,
	};
};

export const resolveWatchOnlySigning = (
	_account: WatchOnlyAccount,
): WatchOnlySigningResolution => ({
	status: "blocked",
	reason: "watch-only accounts cannot sign transactions",
});

export const createNotification = (
	input: Omit<WalletNotification, "read">,
): WalletNotification => ({
	...input,
	read: false,
});

const assertAddress = (address: string) => {
	if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
		throw new Error("expected canonical Sui address");
	}
};

const MIN_STAKE_MIST = 1_000_000_000n;
const DEFAULT_SEND_GAS_BUDGET_MIST = 10_000_000n;
const DEFAULT_STAKE_GAS_BUDGET_MIST = 50_000_000n;

const formatMist = (mist: bigint): string => {
	const whole = mist / 1_000_000_000n;
	const fraction = mist % 1_000_000_000n;
	if (fraction === 0n) {
		return `${whole.toString()} SUI`;
	}

	return `${whole.toString()}.${fraction
		.toString()
		.padStart(9, "0")
		.replace(/0+$/, "")} SUI`;
};
