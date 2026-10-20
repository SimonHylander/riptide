import { createRouter } from '@tanstack/react-router'
import { AuthKitProvider } from '@workos/authkit-tanstack-react-start/client'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'

import { useAuthFromAuthKit } from './auth/useAuthFromAuthKit'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error(
      'VITE_CONVEX_URL is not set. Run `bun run --filter @riptide/backend dev` once to create packages/backend/.env.local.',
    )
  }
  const convex = new ConvexReactClient(convexUrl)

  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => (
      <p>{error instanceof Error ? error.stack : String(error)}</p>
    ),
    defaultNotFoundComponent: () => <p>not found</p>,
    // AuthKit loads the session after mount, so SSR and the first client render agree: both are
    // "loading" and Convex has no token yet. Convex gets the WorkOS access token once AuthKit has a user.
    InnerWrap: ({ children }) => (
      <AuthKitProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
          {children}
        </ConvexProviderWithAuth>
      </AuthKitProvider>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
