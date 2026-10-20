import { createFileRoute } from '@tanstack/react-router'
import { handleCallbackRoute } from '@workos/authkit-tanstack-react-start'

/** AuthKit redirect target (WORKOS_REDIRECT_URI). Public. Sets the session cookie, then returns to `returnPathname`. */
export const Route = createFileRoute('/callback')({
  server: { handlers: { GET: handleCallbackRoute() } },
})
