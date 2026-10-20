import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getAuth } from '@workos/authkit-tanstack-react-start'

import { AccessGate } from '~/auth/AccessGate'
import { SignOutButton } from '~/auth/SignOutButton'
import { FeedProvider } from '~/feed/context'
import { selectFeed } from '~/feed/selectFeed'

const feed = selectFeed()

/** Layout for every page except /sign-in and /callback. Signed-out visitors go to AuthKit and come back here. */
export const Route = createFileRoute('/_authenticated')({
  loader: async ({ location }) => {
    const { user } = await getAuth()
    if (!user) {
      throw redirect({ href: `/sign-in?returnPathname=${encodeURIComponent(location.href)}` })
    }
    return { email: user.email }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { email } = Route.useLoaderData()
  return (
    <>
      <header className="flex items-center justify-between border-b px-8 py-4">
        <span className="font-bold">Riptide</span>
        <div className="flex items-center gap-4">
          <span className="text-sm">{email}</span>
          <SignOutButton />
        </div>
      </header>
      {/* Inside the gate, so feed reads and heartbeats only run for the allowed user. */}
      <AccessGate>
        <FeedProvider feed={feed}>
          <Outlet />
        </FeedProvider>
      </AccessGate>
    </>
  )
}
