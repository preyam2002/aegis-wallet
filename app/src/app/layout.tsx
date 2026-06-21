import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-sans",
	display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Aegis Wallet",
	description: "A Sui wallet with safe signing and Vault Mode.",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
	<html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
		<body>{children}</body>
	</html>
);

export default RootLayout;
