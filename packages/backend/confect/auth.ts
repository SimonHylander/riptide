import type { AuthConfig } from "convex/server"

// Convex evaluates this with the deployment env on push. If WORKOS_CLIENT_ID is unset, the push fails with
// "Environment variable WORKOS_CLIENT_ID is used in auth config file but its value was not set" plus `env set`
// instructions, so a misconfigured deployment fails loudly without an explicit check here.
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
