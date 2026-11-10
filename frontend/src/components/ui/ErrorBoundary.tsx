import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CampusSarthi UI Render Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center bg-gray-50/50 rounded-xl border border-gray-200 m-6">
          <div className="rounded-full bg-red-50 p-3 text-red-600 mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Something went wrong rendering this view
          </h2>
          <p className="max-w-md text-sm text-gray-500 mb-6">
            {this.state.error?.message || 'An unexpected error occurred while rendering.'}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={this.handleReset}
              className="gap-2"
              size="sm"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/dashboard';
              }}
            >
              Back to Overview
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

