import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return {
      hasError: true,
      message: err.message || 'Something went wrong.',
    }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('Route error:', err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card mx-auto max-w-lg space-y-4 p-6 text-left">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            This screen couldn&apos;t load
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {this.state.message}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
          <Link to="/" className="link-accent block">
            Back to Summary
          </Link>
        </div>
      )
    }
    return this.props.children
  }
}
