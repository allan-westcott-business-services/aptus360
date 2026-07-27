import { Component } from "react";

/* A thrown render takes the whole page white and says nothing about
   where. This confines the failure to the panel that broke and shows
   the message, so a bad screen doesn't cost you the rest of the app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Caught by boundary:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="eb">
        <style>{CSS}</style>
        <p className="eb-title">{this.props.label || "This screen"} hit a problem</p>
        <p className="eb-msg">{error.message || String(error)}</p>
        <div className="eb-actions">
          <button className="btn accent" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
        <p className="eb-note">
          The rest of the app is still working &mdash; use the sidebar to move elsewhere.
        </p>
      </div>
    );
  }
}

const CSS = `
.eb { border: 1px solid var(--err-border); background: var(--err-bg); border-radius: var(--radius);
  padding: 24px; text-align: center; }
.eb-title { margin: 0 0 6px; font-size: 15px; font-weight: 700; color: var(--err-text); }
.eb-msg { margin: 0 0 16px; font-size: 12.5px; color: var(--err-text);
  font-family: ui-monospace, Menlo, monospace; word-break: break-word; }
.eb-actions { display: flex; gap: 8px; justify-content: center; }
.eb-note { margin: 14px 0 0; font-size: 11.5px; color: var(--muted); }
`;
