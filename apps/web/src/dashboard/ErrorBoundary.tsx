import { Component, type ReactNode } from "react"

interface ErrorBoundaryProps {
  /** Rendered instead of `children` after an error. `retry` clears the error and renders `children` again. */
  readonly fallback: (retry: () => void) => ReactNode
  readonly children: ReactNode
}

/**
 * Catches errors thrown while rendering `children`. Feeds report expected
 * failures as a `FeedResult`, this catches the rest, such as Convex server or
 * network errors that Confect's `useQuery` throws.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError = () => ({ failed: true })

  retry = () => this.setState({ failed: false })

  override render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children
  }
}
