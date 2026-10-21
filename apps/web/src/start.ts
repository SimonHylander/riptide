import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { authkitMiddleware } from '@workos/authkit-tanstack-react-start'

import { requiresAuth } from './feed/selectFeed'

// Defining a start instance drops Start's default CSRF check, so it is re-added before AuthKit.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Runs the AuthKit session middleware (WORKOS_* env, read at request time) on every request.
 * It validates that env on each request, so it is left out without `requiresAuth` (the fixture feed).
 */
export const startInstance = createStart(() => ({
  requestMiddleware: requiresAuth ? [csrfMiddleware, authkitMiddleware()] : [csrfMiddleware],
}))
