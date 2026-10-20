import { useAccessToken, useAuth } from '@workos/authkit-tanstack-react-start/client'
import { useCallback, useMemo } from 'react'

/** Adapts AuthKit to the `useAuth` prop of `ConvexProviderWithAuth`, so Convex sends the WorkOS access token. */
export function useAuthFromAuthKit() {
  const { loading, user } = useAuth()
  const { getAccessToken, refresh } = useAccessToken()

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null
      return (forceRefreshToken ? await refresh() : await getAccessToken()) ?? null
    },
    [user, refresh, getAccessToken],
  )

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated: user !== null, fetchAccessToken }),
    [loading, user, fetchAccessToken],
  )
}
