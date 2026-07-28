import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional label of the area for the message (e.g. tab name). */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions in its subtree and shows a recoverable
 * fallback instead of letting the whole React app unmount to a white screen.
 *
 * Give it a `key` (e.g. the active tab + patient id) so it re-mounts and clears
 * its error state automatically when the user navigates elsewhere.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface the details for diagnostics (e.g. DevTools / log forwarding).
    console.error('UI-Fehler abgefangen:', error, info.componentStack);
  }

  private handleReset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="max-w-md w-full bg-white rounded-xl border border-rose-200 shadow-sm p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center">
              <AlertTriangle size={20} className="text-rose-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {this.props.label ? `Fehler in „${this.props.label}"` : 'Es ist ein Fehler aufgetreten'}
              </h2>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                Dieser Bereich konnte nicht angezeigt werden. Die übrigen Daten sind nicht betroffen.
                Wechsle den Patienten/Tab oder versuche es erneut.
              </p>
            </div>
            {this.state.error.message && (
              <pre className="w-full text-left text-[10px] text-slate-400 bg-slate-50 rounded-lg p-2 overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={12} /> Erneut versuchen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
