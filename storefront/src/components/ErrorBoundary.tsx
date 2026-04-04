"use client"

import React from "react"

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  name?: string
}

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-stone-400 text-sm mb-3">Something went wrong loading this section.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
