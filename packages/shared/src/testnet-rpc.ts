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

type SuiRpcOptions = {
	fetcher?: RpcFetcher;
	maxAttempts?: number;
	retryDelayMs?: number;
};

export const getSuiBalance = async (
	address: string,
	fetcher: RpcFetcher = fetch,
): Promise<SuiBalance> => {
	const result = await suiRpc<SuiBalance>("suix_getBalance", [address], {
		fetcher,
	});

	return {
		coinType: result.coinType,
		totalBalance: result.totalBalance,
	};
};

export const listOwnedObjectTypes = async (
	address: string,
	fetcher: RpcFetcher = fetch,
): Promise<string[]> => {
	const result = await suiRpc<{
		data: { data?: { type?: string } }[];
	}>(
		"suix_getOwnedObjects",
		[address, { options: { showType: true, showContent: false } }, null, 50],
		{ fetcher },
	);

	return result.data
		.map((entry) => entry.data?.type)
		.filter((type): type is string => typeof type === "string");
};

export const suiRpc = async <T>(
	method: string,
	params: unknown[],
	{ fetcher = fetch, maxAttempts = 3, retryDelayMs = 250 }: SuiRpcOptions = {},
): Promise<T> => {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await fetcher(TESTNET_RPC_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
			});

			if (!response.ok) {
				if (attempt < maxAttempts && response.status >= 500) {
					await wait(retryDelayMs);
					continue;
				}
				throw new Error(
					`Sui RPC ${method} failed with HTTP ${response.status}`,
				);
			}

			const body = (await response.json()) as JsonRpcResponse<T>;
			if (body.error) {
				throw new Error(`Sui RPC ${method} failed: ${body.error.message}`);
			}
			if (!("result" in body)) {
				throw new Error(`Sui RPC ${method} returned no result`);
			}

			return body.result as T;
		} catch (error) {
			lastError = error;
			if (attempt >= maxAttempts || !isTransientFetchError(error)) {
				throw error;
			}
			await wait(retryDelayMs);
		}
	}

	throw lastError;
};

const isTransientFetchError = (error: unknown): boolean =>
	error instanceof TypeError ||
	(error instanceof Error &&
		/(UND_ERR_|fetch failed|socket|timeout|terminated|ECONNRESET|ETIMEDOUT)/i.test(
			`${error.name} ${error.message}`,
		));

const wait = (delayMs: number): Promise<void> =>
	delayMs > 0
		? new Promise((resolve) => setTimeout(resolve, delayMs))
		: Promise.resolve();
