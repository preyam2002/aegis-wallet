import { normalizeSuiAddress } from "@mysten/sui/utils";
import { type RpcFetcher, suiRpc } from "./testnet-rpc";

export type WalletActivityDirection = "inbound" | "outbound" | "internal";
export type WalletActivityStatus = "success" | "failure";

export type WalletActivityRow = {
	id: string;
	digest: string;
	timestampMs?: string;
	direction: WalletActivityDirection;
	amountMist: string;
	coinType?: string;
	label: string;
	status: WalletActivityStatus;
};

type BalanceChangeOwner =
	| string
	| { AddressOwner?: string; ObjectOwner?: string; Shared?: unknown };

type TransactionBlock = {
	digest: string;
	timestampMs?: string;
	effects?: { status?: { status?: string } };
	balanceChanges?: {
		owner: BalanceChangeOwner;
		coinType: string;
		amount: string;
	}[];
};

type QueryTransactionBlocksResult = {
	data: TransactionBlock[];
};

export const listRecentActivityRows = async (
	address: string,
	{
		fetcher = fetch,
		limit = 20,
	}: {
		fetcher?: RpcFetcher;
		limit?: number;
	} = {},
): Promise<WalletActivityRow[]> => {
	const [outgoing, incoming] = await Promise.all([
		queryTransactionBlocks({
			filter: { FromAddress: address },
			fetcher,
			limit,
		}),
		queryTransactionBlocks({ filter: { ToAddress: address }, fetcher, limit }),
	]);
	const blocksByDigest = new Map<string, TransactionBlock>();
	for (const block of [...outgoing.data, ...incoming.data]) {
		if (!blocksByDigest.has(block.digest)) {
			blocksByDigest.set(block.digest, block);
		}
	}

	return [...blocksByDigest.values()]
		.sort(
			(left, right) =>
				Number(right.timestampMs ?? 0) - Number(left.timestampMs ?? 0),
		)
		.slice(0, limit)
		.map((block) => activityRowFromBlock(block, address));
};

const queryTransactionBlocks = ({
	filter,
	fetcher,
	limit,
}: {
	filter: { FromAddress: string } | { ToAddress: string };
	fetcher: RpcFetcher;
	limit: number;
}): Promise<QueryTransactionBlocksResult> =>
	suiRpc<QueryTransactionBlocksResult>(
		"suix_queryTransactionBlocks",
		[
			{
				filter,
				options: {
					showBalanceChanges: true,
					showEffects: true,
					showInput: true,
				},
			},
			null,
			limit,
			true,
		],
		{ fetcher },
	);

const activityRowFromBlock = (
	block: TransactionBlock,
	address: string,
): WalletActivityRow => {
	const normalizedAddress = normalizeAddress(address);
	const changes =
		block.balanceChanges?.filter(
			(change) =>
				normalizeAddress(ownerAddress(change.owner)) === normalizedAddress,
		) ?? [];
	const primaryChange =
		changes.find((change) => change.coinType === "0x2::sui::SUI") ?? changes[0];
	const netMist = changes
		.filter((change) => change.coinType === primaryChange?.coinType)
		.reduce((sum, change) => sum + BigInt(change.amount), 0n);
	const direction =
		netMist > 0n ? "inbound" : netMist < 0n ? "outbound" : "internal";

	return {
		id: block.digest,
		digest: block.digest,
		...(block.timestampMs ? { timestampMs: block.timestampMs } : {}),
		direction,
		amountMist: absoluteMist(netMist).toString(),
		...(primaryChange ? { coinType: primaryChange.coinType } : {}),
		label: activityLabel(direction, primaryChange?.coinType),
		status: block.effects?.status?.status === "failure" ? "failure" : "success",
	};
};

const ownerAddress = (owner: BalanceChangeOwner): string => {
	if (typeof owner === "string") {
		return owner;
	}

	return owner.AddressOwner ?? "";
};

const normalizeAddress = (address: string): string =>
	address ? normalizeSuiAddress(address) : "";

const absoluteMist = (amount: bigint): bigint =>
	amount < 0n ? -amount : amount;

const activityLabel = (
	direction: WalletActivityDirection,
	coinType?: string,
): string => {
	const coin = coinSymbol(coinType);
	if (direction === "inbound") {
		return `Received ${coin}`;
	}
	if (direction === "outbound") {
		return `Sent ${coin}`;
	}

	return "Wallet activity";
};

const coinSymbol = (coinType?: string): string => {
	if (!coinType) {
		return "SUI";
	}
	if (coinType === "0x2::sui::SUI") {
		return "SUI";
	}

	return coinType.split("::").at(-1) ?? coinType;
};
