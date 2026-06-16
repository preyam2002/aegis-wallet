import { WalletDashboard } from "../components/WalletDashboard";
import { WalletAccountProvider } from "../lib/wallet-account";

const Page = () => (
	<WalletAccountProvider>
		<WalletDashboard />
	</WalletAccountProvider>
);

export default Page;
