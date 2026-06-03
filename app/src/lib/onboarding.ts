import type { AuthProvider, EnokiNetwork } from "@mysten/enoki";

export const enokiWalletProviders = [
	"google",
	"twitch",
	"facebook",
] as const satisfies readonly AuthProvider[];

export type SponsoredTransactionInput = {
	network?: EnokiNetwork;
	sender: string;
	transactionKindBytes: string;
	allowedAddresses?: string[];
	allowedMoveCallTargets?: string[];
};

export type EnokiWalletRegistrationInput = {
	apiKey: string;
	client: unknown;
	network?: EnokiNetwork;
	redirectUrl?: string;
	providerClientIds: Partial<
		Record<(typeof enokiWalletProviders)[number], string>
	>;
};

export type EnokiWalletRegistrationOptions = {
	apiKey: string;
	client: unknown;
	network: EnokiNetwork;
	providers: Partial<
		Record<
			(typeof enokiWalletProviders)[number],
			{ clientId: string; redirectUrl?: string }
		>
	>;
};

export type SponsoredGasClient = {
	createSponsoredTransaction(
		input: ReturnType<typeof buildSponsoredTransactionInput>,
	): Promise<{ bytes: string; digest: string }>;
	executeSponsoredTransaction(input: {
		digest: string;
		signature: string;
	}): Promise<{ digest: string }>;
};

export type OnboardingStatus = {
	zkLogin: "configured";
	sponsoredGas: "ready" | "blocked";
	reason?: string;
};

export const buildSponsoredTransactionInput = ({
	network = "testnet",
	sender,
	transactionKindBytes,
	allowedAddresses,
	allowedMoveCallTargets,
}: SponsoredTransactionInput) => ({
	network,
	sender,
	transactionKindBytes,
	...(allowedAddresses ? { allowedAddresses } : {}),
	...(allowedMoveCallTargets ? { allowedMoveCallTargets } : {}),
});

export const buildEnokiWalletRegistrationOptions = ({
	apiKey,
	client,
	network = "testnet",
	redirectUrl,
	providerClientIds,
}: EnokiWalletRegistrationInput): EnokiWalletRegistrationOptions => {
	const providers = Object.fromEntries(
		enokiWalletProviders
			.map((provider) => {
				const clientId = providerClientIds[provider];
				return clientId
					? [
							provider,
							{
								clientId,
								...(redirectUrl ? { redirectUrl } : {}),
							},
						]
					: null;
			})
			.filter(
				(
					entry,
				): entry is [
					(typeof enokiWalletProviders)[number],
					{ clientId: string; redirectUrl?: string },
				] => Boolean(entry),
			),
	) as EnokiWalletRegistrationOptions["providers"];

	if (Object.keys(providers).length === 0) {
		throw new Error("at least one Enoki provider client ID is required");
	}

	return {
		apiKey,
		client,
		network,
		providers,
	};
};

export const createSponsoredGasTransaction = (
	client: SponsoredGasClient,
	input: SponsoredTransactionInput,
) => client.createSponsoredTransaction(buildSponsoredTransactionInput(input));

export const executeSponsoredGasTransaction = (
	client: SponsoredGasClient,
	input: { digest: string; signature: string },
) => client.executeSponsoredTransaction(input);

export const getOnboardingStatus = (
	apiKey: string | undefined,
): OnboardingStatus => {
	if (!apiKey) {
		return {
			zkLogin: "configured",
			sponsoredGas: "blocked",
			reason: "missing Enoki API key",
		};
	}

	return {
		zkLogin: "configured",
		sponsoredGas: "ready",
	};
};
