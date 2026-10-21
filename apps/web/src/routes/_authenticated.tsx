import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getAuth } from '@workos/authkit-tanstack-react-start'

import { AccessGate } from '~/auth/AccessGate'
import { FeedProvider } from '~/feed/context'
import { requiresAuth, selectedFeed } from '~/feed/selectFeed'

/**
 * Layout for every page except /sign-in and /callback. Signed-out visitors go to AuthKit and come back here.
 * Without `requiresAuth` (the fixture feed) it skips sign-in and the access check, and `email` is null.
 * Pages render their own header, see `routes/_authenticated/index.tsx`.
 */
export const Route = createFileRoute('/_authenticated')({
  loader: async ({ location }) => {
    if (!requiresAuth) return { email: null }
    const { user } = await getAuth()
    if (!user) {
      throw redirect({ href: `/sign-in?returnPathname=${encodeURIComponent(location.href)}` })
    }
    return { email: user.email }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const page = (
    <FeedProvider feed={selectedFeed}>
      <Outlet />
    </FeedProvider>
  )
  // Inside the gate, so feed reads and heartbeats only run for the allowed user.
  return requiresAuth ? <AccessGate>{page}</AccessGate> : page
}
