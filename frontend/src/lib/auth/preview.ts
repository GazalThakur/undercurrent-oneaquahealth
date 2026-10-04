/**
 * Grok auth broker defaults (server-only — NEVER import from the client).
 *
 * OAuth client credentials are never baked into the repo. When sign-in is
 * enabled (`VITE_AUTH_ENABLED` not `"false"`), set `GROK_AUTH_CLIENT_ID` and
 * `GROK_AUTH_CLIENT_SECRET` in the server environment (see `.env.example`).
 */

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns accepted for sandbox live-preview OAuth callbacks. Better Auth
 * derives the preview origin from the request host and validates it against
 * this list when `BETTER_AUTH_URL` is unset.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
