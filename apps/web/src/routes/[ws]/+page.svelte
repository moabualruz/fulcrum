<!--
	`/<ws>` — workspace home. This route exists only to host the server `load`
	in `+page.server.ts`, which always `redirect`s to `/<ws>/projects`. The
	component never renders (the redirect resolves first); it is required so
	SvelteKit recognises the directory as a page route.
-->
<noscript>Redirecting to the workspace project list…</noscript>
