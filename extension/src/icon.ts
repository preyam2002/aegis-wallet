// Brass Aegis shield, inlined as a data URI for the wallet-standard `icon` field
// (must be a data: URL per the spec) and the toolbar action.
export const AEGIS_ICON =
	"data:image/svg+xml;base64," +
	btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e7c987"/><stop offset="0.5" stop-color="#d8b46a"/><stop offset="1" stop-color="#a8884a"/>
  </linearGradient></defs>
  <rect width="96" height="96" rx="20" fill="#0a0f0c"/>
  <path d="M48 14 L78 26 L78 50 Q78 74 48 84 Q18 74 18 50 L18 26 Z" fill="url(#g)"/>
  <text x="48" y="60" font-family="Georgia, serif" font-size="40" font-weight="700" fill="#120d05" text-anchor="middle">A</text>
</svg>`,
	);
