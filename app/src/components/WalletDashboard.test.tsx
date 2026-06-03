import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletDashboard } from "./WalletDashboard";

describe("WalletDashboard UX evidence", () => {
	it("renders the five no-browser wallet task surfaces", () => {
		const html = renderToStaticMarkup(<WalletDashboard />);

		expect(html).toContain("Aegis Safe Wallet");
		expect(html).toContain("Send");
		expect(html).toContain("Ready to send 0.25 SUI");
		expect(html).toContain(
			"sui://pay?recipient=0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a",
		);
		expect(html).toContain('aria-label="Scan recipient QR"');
		expect(html).toContain("dApp sessions");
		expect(html).toContain("Sign anyway");
		expect(html).toContain("Recovery");
		expect(html).toContain("Vault Mode");
		expect(html).toContain("Wallet parity");
		expect(html).toContain("Pre-sign simulation");
		expect(html).toContain("Cross-chain bridge");
		expect(html).toContain("<strong>0</strong><span>Planned</span>");
		expect(html).toContain("Network settings");
		expect(html).toContain("Mainnet spending requires explicit approval");
		expect(html).toContain("Security settings");
		expect(html).toContain("Auto-lock");
		expect(html).toContain("Fiat on-ramp");
		expect(html).toContain("Provider KYC handoff");
		expect(html).toContain("Bridge routes");
		expect(html).toContain("Sui to Ethereum");
		expect(html).toContain("Advanced trading");
		expect(html).toContain("Perps");
	});
});
