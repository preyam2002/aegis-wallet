export const TESTNET_RPC_URL = "https://fullnode.testnet.sui.io:443";

export type RpcFetcher = typeof fetch;

export type SuiBalance = {
	coinType: string;
	totalBalance: string;
};

type JsonRpcResponse<T> = {
	jsonrpc: "2.0";
	id: number;
	result?: T;
	error?: { code: number; message: string };
};

export const getSuiBalance = async (
	address: string,
	fetcher: RpcFetcher = fetch,
): Promise<SuiBalance> => {
	const result = await rpc<SuiBalance>("suix_getBalance", [address], fetcher);

	return {
		coinType: result.coinType,
		totalBalance: result.totalBalance,
	};
};

export const listOwnedObjectTypes = async (
	address: string,
	fetcher: RpcFetcher = fetch,
): Promise<string[]> => {
	const result = await rpc<{
		data: { data?: { type?: string } }[];
	}>(
		"suix_getOwnedObjects",
		[address, { options: { showType: true, showContent: false } }, null, 50],
		fetcher,
	);

	return result.data
		.map((entry) => entry.data?.type)
		.filter((type): type is string => typeof type === "string");
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
