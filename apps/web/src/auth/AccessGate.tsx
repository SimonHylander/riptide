import { QueryResult, useQuery } from '@confect/react'
import refs from '@riptide/backend/confect/_generated/refs'
import { useConvexAuth } from 'convex/react'
import type { ReactNode } from 'react'

import { SignOutButton } from './SignOutButton'

/**
 * Renders `children` only for ALLOWED_USER_ID, per `dashboard.viewer`. Anyone else sees {@link NotAuthorized}.
 * This is UX only: the Convex data functions enforce the same check.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const convexAuth = useConvexAuth()
  const viewer = useQuery(refs.public.dashboard.viewer, convexAuth.isAuthenticated ? {} : 'skip')

  // Convex rejected the WorkOS token (e.g. WORKOS_CLIENT_ID mismatch on the deployment).
  if (!convexAuth.isLoading && !convexAuth.isAuthenticated) return <NotAuthorized />

  return QueryResult.match(viewer, {
    onLoading: () => <p className="p-8">Loading…</p>,
    onSuccess: ({ allowed }) => (allowed ? children : <NotAuthorized />),
    onFailure: () => <NotAuthorized />,
  })
}

/** Shown to a signed-in user who is not ALLOWED_USER_ID. */
function NotAuthorized() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Not authorized</h1>
      <p className="mt-2">This account does not have access to Riptide.</p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </main>
  )
}
