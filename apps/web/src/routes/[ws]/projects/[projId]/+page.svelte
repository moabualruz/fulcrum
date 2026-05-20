<!--
	`/<ws>/projects/<projId>` — project home. This route exists only to host the
	server `load` in `+page.server.ts`, which always `redirect`s to the Capture
	stage (`/<ws>/projects/<projId>/capture`, IA-MAP §1 default). The component
	never renders; it is required so SvelteKit recognises the directory as a
	page route.
-->
<noscript>Redirecting to the Capture stage…</noscript>
