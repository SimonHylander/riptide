import { createRouter } from '@tanstack/react-router'
import { AuthKitProvider } from '@workos/authkit-tanstack-react-start/client'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import type { ReactElement, ReactNode } from 'react'

import { useAuthFromAuthKit } from './auth/useAuthFromAuthKit'
import { requiresAuth } from './feed/selectFeed'
import { routeTree } from './routeTree.gen'

/**
 * AuthKit and Convex around every page. Without `requiresAuth` (the fixture
 * feed) nothing reads Convex or the session, so the wrap passes pages through and no
 * VITE_CONVEX_URL is needed.
 */
const providers = (): ((props: { children: ReactNode }) => ReactElement) => {
  if (!requiresAuth) return ({ children }) => <>{children}</>

  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error(
      'VITE_CONVEX_URL is not set. Run `bun run --filter @riptide/backend dev` once to create packages/backend/.env.local.',
    )
  }
  const convex = new ConvexReactClient(convexUrl)

  // AuthKit loads the session after mount, so SSR and the first client render agree: both are
  // "loading" and Convex has no token yet. Convex gets the WorkOS access token once AuthKit has a user.
  return ({ children }) => (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  )
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => (
      <p>{error instanceof Error ? error.stack : String(error)}</p>
    ),
    defaultNotFoundComponent: () => <p>not found</p>,
    InnerWrap: providers(),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
