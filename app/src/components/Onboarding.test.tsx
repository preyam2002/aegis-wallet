import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletAccountProvider } from "../lib/wallet-account";
import { Onboarding } from "./Onboarding";

describe("Onboarding", () => {
	it("renders the real create/import surfaces and the env-gated zkLogin button", () => {
		const html = renderToStaticMarkup(
			<WalletAccountProvider>
				<Onboarding />
			</WalletAccountProvider>,
		);

		expect(html).toContain("Set up your wallet");
		expect(html).toContain("Create new");
		expect(html).toContain("Import key");
		expect(html).toContain("Create wallet");
		// zkLogin stays honest: gated until Enoki/Google env is configured.
		expect(html).toContain("configure Enoki to enable");
		expect(html).toContain("Hot key, testnet only");
	});
});
