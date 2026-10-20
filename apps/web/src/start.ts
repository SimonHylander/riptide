import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { authkitMiddleware } from '@workos/authkit-tanstack-react-start'

// Defining a start instance drops Start's default CSRF check, so it is re-added before AuthKit.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/** Runs the AuthKit session middleware (WORKOS_* env, read at request time) on every request. */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, authkitMiddleware()],
}))
