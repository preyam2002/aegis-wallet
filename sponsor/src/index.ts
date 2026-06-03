import { EnokiClient, type EnokiNetwork } from "@mysten/enoki";

export type SponsorEnv = Record<string, string | undefined>;

export type SponsorConfig = {
	apiKey: string;
	network: EnokiNetwork;
	apiUrl?: string;
	allowedAddresses?: string[];
	allowedMoveCallTargets?: string[];
};

export type CreateSponsorRequest = {
	network?: EnokiNetwork;
	sender: string;
	transactionKindBytes: string;
};

export type ExecuteSponsorRequest = {
	digest: string;
	signature: string;
};

export type SponsorClient = {
	createSponsoredTransaction(input: {
		network?: EnokiNetwork;
		sender: string;
		transactionKindBytes: string;
		allowedAddresses?: string[];
		allowedMoveCallTargets?: string[];
	}): Promise<{ bytes: string; digest: string }>;
	executeSponsoredTransaction(
		input: ExecuteSponsorRequest,
	): Promise<{ digest: string }>;
};

export type SponsorServiceInput = {
	config: SponsorConfig;
	client?: SponsorClient;
};

export const loadSponsorConfig = (
	env: SponsorEnv = process.env,
): SponsorConfig => {
	const apiKey = env.ENOKI_PRIVATE_API_KEY?.trim();
	if (!apiKey) {
		throw new Error("ENOKI_PRIVATE_API_KEY is required");
	}

	return {
		apiKey,
		network: parseNetwork(env.ENOKI_NETWORK),
		...(env.ENOKI_API_URL?.trim() ? { apiUrl: env.ENOKI_API_URL.trim() } : {}),
		...optionalAddresses(env.ENOKI_ALLOWED_ADDRESSES),
		...optionalMoveCallTargets(env.ENOKI_ALLOWED_MOVE_CALL_TARGETS),
	};
};

export const createEnokiSponsorClient = (
	config: SponsorConfig,
): SponsorClient =>
	new EnokiClient({
		apiKey: config.apiKey,
		...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
	});

export const createSponsorService = ({
	config,
	client = createEnokiSponsorClient(config),
}: SponsorServiceInput) => ({
	create(request: CreateSponsorRequest) {
		return client.createSponsoredTransaction({
			network: request.network ?? config.network,
			sender: request.sender,
			transactionKindBytes: request.transactionKindBytes,
			allowedAddresses: config.allowedAddresses ?? [request.sender],
			...(config.allowedMoveCallTargets
				? { allowedMoveCallTargets: config.allowedMoveCallTargets }
				: {}),
		});
	},
	execute(request: ExecuteSponsorRequest) {
		return client.executeSponsoredTransaction(request);
	},
});

const parseNetwork = (value: string | undefined): EnokiNetwork => {
	if (value === "mainnet" || value === "testnet" || value === "devnet") {
		return value;
	}
	return "testnet";
};

const optionalAddresses = (value: string | undefined) => {
	const items = parseList(value);
	return items.length ? { allowedAddresses: items } : {};
};

const optionalMoveCallTargets = (value: string | undefined) => {
	const items = parseList(value);
	return items.length ? { allowedMoveCallTargets: items } : {};
};

const parseList = (value: string | undefined) =>
	value
		?.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0) ?? [];
