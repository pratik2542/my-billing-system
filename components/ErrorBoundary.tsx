import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

// @ts-ignore
export class ErrorBoundary extends React.Component<Props, State> {
  // @ts-ignore
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, errorMessage: error?.message || 'Unexpected error' };
  }

  public componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public handleReset = () => {
    // @ts-ignore
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-lg mx-auto my-12 bg-white rounded-xl shadow-md border border-red-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {/* @ts-ignore */}
              {this.props.fallbackTitle || 'Something went wrong rendering this section'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {/* @ts-ignore */}
              {this.state.errorMessage || 'An unexpected error occurred.'}
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw size={14} /> Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
