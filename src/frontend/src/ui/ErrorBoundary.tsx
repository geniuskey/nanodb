import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Last line of defence for an unexpected render error (UIX-006).
 *
 * Without it a thrown render turns the whole page white with no way back,
 * which during a live demo means a reload and a lost screen. The recovery
 * screen never shows the error itself: stacks and internal paths stay out of
 * the UI, same rule the server error envelope follows.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is a developer surface, not the user's; keep it there.
    console.error("Unhandled render error", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <main>
        <section className="empty-state" data-testid="error-boundary">
          <h1>화면을 표시하지 못했습니다</h1>
          <p>
            예상하지 못한 오류가 발생했습니다. 저장된 이미지와 측정은 그대로 남아 있습니다.
            아래에서 다시 시도하거나 이미지 목록으로 이동하세요.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              data-testid="error-retry"
              onClick={() => this.setState({ failed: false })}
            >
              다시 시도
            </button>
          </div>
        </section>
      </main>
    );
  }
}
