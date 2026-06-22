// Flat indigo Aegis shield, inlined as a data URI for the wallet-standard `icon`
// field (must be a data: URL per the spec). Matches the app's flat-dark brand.
export const AEGIS_ICON =
	"data:image/svg+xml;base64," +
	btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#0b0c0e"/>
  <path d="M48 15 L77 26.5 L77 49 Q77 72 48 83 Q19 72 19 49 L19 26.5 Z" fill="#6e8bff"/>
  <text x="48" y="61" font-family="-apple-system, system-ui, sans-serif" font-size="40" font-weight="700" fill="#0a0c12" text-anchor="middle">A</text>
</svg>`,
	);
