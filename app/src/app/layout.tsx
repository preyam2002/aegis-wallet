import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Aegis Wallet",
	description: "A Sui wallet with safe signing and Vault Mode.",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
	<html lang="en">
		<body>{children}</body>
	</html>
);

export default RootLayout;
