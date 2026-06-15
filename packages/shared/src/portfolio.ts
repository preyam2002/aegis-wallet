import { type RpcFetcher, suiRpc } from "./testnet-rpc";

export type PortfolioTokenBalance = {
	coinType: string;
	symbol: string;
	coinObjectCount: number;
	totalBalance: string;
};

export type PortfolioObjectKind =
	| "coin"
	| "collectible"
	| "capability"
	| "defi-position"
	| "object";

export type PortfolioObject = {
	objectId: string;
	type: string;
	displayName: string;
	kind: PortfolioObjectKind;
	imageUrl?: string;
};

export type WalletPortfolio = {
	tokens: PortfolioTokenBalance[];
	collectibles: PortfolioObject[];
	capabilities: PortfolioObject[];
	defiPositions: PortfolioObject[];
	otherObjects: PortfolioObject[];
};

type AllBalanceResult = {
	coinType: string;
	coinObjectCount?: number;
	totalBalance: string;
}[];

type OwnedObjectsResult = {
	data: OwnedObjectEntry[];
	nextCursor?: string | null;
	hasNextPage?: boolean;
};

type OwnedObjectEntry = {
	data?: {
		objectId?: string;
		type?: string;
		display?: {
			data?: Record<string, string | undefined>;
		};
		content?: OwnedObjectContent;
	};
};

type OwnedObjectContent = {
	fields?: Record<string, unknown>;
};

export const listTokenBalances = async (
	address: string,
	{
		fetcher = fetch,
	}: {
		fetcher?: RpcFetcher;
	} = {},
): Promise<PortfolioTokenBalance[]> => {
	const balances = await suiRpc<AllBalanceResult>(
		"suix_getAllBalances",
		[address],
		{ fetcher },
	);

	return balances.map((balance) => ({
		coinType: balance.coinType,
		symbol: coinSymbol(balance.coinType),
		coinObjectCount: balance.coinObjectCount ?? 0,
		totalBalance: balance.totalBalance,
	}));
};

export const listOwnedInventory = async (
	address: string,
	{
		fetcher = fetch,
		limit = 50,
	}: {
		fetcher?: RpcFetcher;
		limit?: number;
	} = {},
): Promise<PortfolioObject[]> => {
	const result = await suiRpc<OwnedObjectsResult>(
		"suix_getOwnedObjects",
		[
			address,
			{
				options: {
					showContent: true,
					showDisplay: true,
					showType: true,
				},
			},
			null,
			limit,
		],
		{ fetcher },
	);

	return result.data
		.map((entry) => normalizeOwnedObject(entry))
		.filter((object): object is PortfolioObject => object !== null);
};

export const loadWalletPortfolio = async (
	address: string,
	{
		fetcher = fetch,
		objectLimit = 50,
	}: {
		fetcher?: RpcFetcher;
		objectLimit?: number;
	} = {},
): Promise<WalletPortfolio> => {
	const [tokens, objects] = await Promise.all([
		listTokenBalances(address, { fetcher }),
		listOwnedInventory(address, { fetcher, limit: objectLimit }),
	]);

	return {
		tokens,
		collectibles: objects.filter((object) => object.kind === "collectible"),
		capabilities: objects.filter((object) => object.kind === "capability"),
		defiPositions: objects.filter((object) => object.kind === "defi-position"),
		otherObjects: objects.filter((object) => object.kind === "object"),
	};
};

const normalizeOwnedObject = (
	entry: OwnedObjectEntry,
): PortfolioObject | null => {
	const objectId = entry.data?.objectId;
	const type = entry.data?.type;
	if (!objectId || !type) {
		return null;
	}

	const kind = objectKind(type);
	const displayData = entry.data?.display?.data;
	const displayName =
		displayData?.name ??
		displayData?.Name ??
		displayData?.title ??
		typeDisplayName(type);
	const imageUrl =
		displayData?.image_url ?? contentImageUrl(entry.data?.content);

	return {
		objectId,
		type,
		displayName,
		kind,
		...(imageUrl ? { imageUrl } : {}),
	};
};

const objectKind = (type: string): PortfolioObjectKind => {
	if (type.startsWith("0x2::coin::Coin<")) {
		return "coin";
	}
	if (isCapabilityType(type)) {
		return "capability";
	}
	if (isDefiPositionType(type)) {
		return "defi-position";
	}
	if (isCollectibleType(type)) {
		return "collectible";
	}

	return "object";
};

const isCapabilityType = (type: string): boolean =>
	/(\b|::)(Cap|Capability|SessionCap|GuardianCap)(<|$|::)/i.test(type) ||
	type.toLowerCase().endsWith("cap");

const isCollectibleType = (type: string): boolean =>
	/(::|_)(nft|collectible|badge|display|collection)(::|<|$)/i.test(type);

const isDefiPositionType = (type: string): boolean =>
	/(::|_)(position|stake|vault|pool)(::|<|$)/i.test(type);

const contentImageUrl = (content?: OwnedObjectContent): string | undefined => {
	const fields =
		typeof content === "object" && content !== null && "fields" in content
			? content.fields
			: undefined;
	if (!fields || typeof fields !== "object") {
		return undefined;
	}

	const value =
		"url" in fields
			? fields.url
			: "image_url" in fields
				? fields.image_url
				: undefined;

	return typeof value === "string" ? value : undefined;
};

const coinSymbol = (coinType: string): string => {
	if (coinType === "0x2::sui::SUI") {
		return "SUI";
	}

	const baseType = coinType.split("<")[0] ?? coinType;
	return baseType.split("::").at(-1) ?? baseType;
};

const typeDisplayName = (type: string): string => {
	const coinMatch = /^0x2::coin::Coin<(.+)>$/.exec(type);
	if (coinMatch) {
		return `Coin<${coinSymbol(coinMatch[1])}>`;
	}

	return type.split("::").at(-1)?.replace(/[<>]/g, "") ?? type;
};
