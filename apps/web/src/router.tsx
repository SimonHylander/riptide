import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { ConvexProvider } from 'convex/react'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error(
      'VITE_CONVEX_URL is not set. Run `bun run --filter @riptide/backend dev` once to create packages/backend/.env.local.',
    )
  }
  const convexQueryClient = new ConvexQueryClient(convexUrl)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  return routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0, // Let React Query handle all caching
      defaultErrorComponent: ({ error }) => (
        <p>{error instanceof Error ? error.stack : String(error)}</p>
      ),
      defaultNotFoundComponent: () => <p>not found</p>,
      Wrap: ({ children }) => (
        <ConvexProvider client={convexQueryClient.convexClient}>
          {children}
        </ConvexProvider>
      ),
    }),
    queryClient,
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
