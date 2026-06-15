import type { Metadata } from "next";
import { Sora, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700", "800"],
	variable: "--font-sora",
	display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-spline-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Aegis Wallet",
	description: "A Sui wallet with safe signing and Vault Mode.",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
	<html lang="en" className={`${sora.variable} ${splineSansMono.variable}`}>
		<body>{children}</body>
	</html>
);

export default RootLayout;
