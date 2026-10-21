import { createFileRoute } from '@tanstack/react-router'
import { handleCallbackRoute } from '@workos/authkit-tanstack-react-start'

// Static page for failed callbacks. A link instead of a redirect, so a broken config cannot loop through /sign-in.
const errorPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sign-in failed</title></head>
  <body>
    <h1>Sign-in failed</h1>
    <p>The sign-in callback could not be completed.</p>
    <p><a href="/sign-in">Try signing in again</a></p>
  </body>
</html>`

/**
 * AuthKit redirect target (WORKOS_REDIRECT_URI). Public. Sets the session cookie, then returns to `returnPathname`.
 * Failures (missing code, rejected exchange) get a 400 HTML page linking back to /sign-in. AuthKit logs the error.
 */
export const Route = createFileRoute('/callback')({
  server: {
    handlers: {
      GET: handleCallbackRoute({
        onError: () =>
          new Response(errorPage, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      }),
    },
  },
})
