import { createFileRoute } from '@tanstack/react-router'
import { getSignInUrl } from '@workos/authkit-tanstack-react-start'

/**
 * Starts the AuthKit sign-in flow (the WorkOS "Initiate login URI"). Public.
 * `?returnPathname=` is where the callback lands afterwards. There is no sign-up route: sign-up is off in WorkOS.
 */
export const Route = createFileRoute('/sign-in')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const returnPathname = new URL(request.url).searchParams.get('returnPathname')
        const url = await getSignInUrl(returnPathname ? { data: { returnPathname } } : undefined)
        return new Response(null, { status: 307, headers: { Location: url } })
      },
    },
  },
})
