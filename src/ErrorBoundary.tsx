// Top-level error boundary.
//
// One specific concern from the brief's One Thing: a JS exception that
// propagates to React's default behavior typically blanks the rendered tree
// — and on most browsers the body shows through, which we've styled dark
// in index.css, so we're already protected against the white-flash worst
// case. But without an error boundary, the audio engine layers may also
// stop because their effects/refs are torn down. We catch errors here so
// audio keeps playing even if the UI breaks.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // We log to console so a developer can find the problem; we never
    // phone home and we never surface a stack trace to the user.
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full bg-ink-950 text-stone-100 flex items-center justify-center px-8">
          <div className="text-center max-w-sm">
            <h1 className="font-serif text-stone-50 text-2xl mb-3">
              Something went quiet here.
            </h1>
            <p className="text-stone-300 text-sm mb-6">
              Audio may still be playing. Tap to reload only when you're ready.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-soft bg-ink-700 text-stone-100 text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
