import { useAuth } from '@workos/authkit-tanstack-react-start/client'

/** Ends the AuthKit session and returns to `/`, which redirects to sign-in. */
export function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void signOut()}>
      Sign out
    </button>
  )
}
