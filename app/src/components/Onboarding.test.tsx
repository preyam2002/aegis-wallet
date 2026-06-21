import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletAccountProvider } from "../lib/wallet-account";
import { Onboarding } from "./Onboarding";

describe("Onboarding", () => {
	it("renders the real create/import surfaces", () => {
		const html = renderToStaticMarkup(
			<WalletAccountProvider>
				<Onboarding />
			</WalletAccountProvider>,
		);

		expect(html).toContain("Set up your wallet");
		expect(html).toContain("Create new");
		expect(html).toContain("Import key");
		expect(html).toContain("Create wallet");
		expect(html).toContain("Back up before funding");
		expect(html).toContain("Hot key, testnet only");
	});
});
