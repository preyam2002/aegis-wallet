import { type RpcFetcher, TESTNET_RPC_URL } from "./testnet-rpc";

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

type JsonRpcResponse<T> = {
	jsonrpc: "2.0";
	id: number;
	result?: T;
	error?: { code: number; message: string };
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
	rpc<QueryTransactionBlocksResult>(
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
		fetcher,
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
	const netMist = changes.reduce(
		(sum, change) => sum + BigInt(change.amount),
		0n,
	);
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

const normalizeAddress = (address: string): string => address.toLowerCase();

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

const rpc = async <T>(
	method: string,
	params: unknown[],
	fetcher: RpcFetcher,
): Promise<T> => {
	const response = await fetcher(TESTNET_RPC_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});

	if (!response.ok) {
		throw new Error(`Sui RPC ${method} failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as JsonRpcResponse<T>;
	if (body.error) {
		throw new Error(`Sui RPC ${method} failed: ${body.error.message}`);
	}
	if (!body.result) {
		throw new Error(`Sui RPC ${method} returned no result`);
	}

	return body.result;
};
