import type { AuthConfig } from "convex/server"

// Convex evaluates this with the deployment env on push and rejects the push if WORKOS_CLIENT_ID is unset.
const clientId = process.env.WORKOS_CLIENT_ID!
const jwks = `https://api.workos.com/sso/jwks/${clientId}`

/**
 * Accepts WorkOS AuthKit access tokens, generated into `convex/auth.config.ts`.
 * Only the first issuer checks `aud`: user-management tokens can omit it.
 */
export default {
  providers: [
    { type: "customJwt", issuer: "https://api.workos.com/", algorithm: "RS256", jwks, applicationID: clientId },
    { type: "customJwt", issuer: `https://api.workos.com/user_management/${clientId}`, algorithm: "RS256", jwks },
  ],
} satisfies AuthConfig
