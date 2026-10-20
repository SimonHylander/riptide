import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { SignOutButton } from '~/auth/SignOutButton'
import { Dashboard } from '~/dashboard/Dashboard'

const layout = getRouteApi('/_authenticated')

export const Route = createFileRoute('/_authenticated/')({
  component: Home,
})

/** The dashboard, with the signed-in account in its header. No account controls when auth is off (fixture feed). */
function Home() {
  const { email } = layout.useLoaderData()
  return (
    <Dashboard
      account={
        email === null ? undefined : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{email}</span>
            <SignOutButton />
          </div>
        )
      }
    />
  )
}
