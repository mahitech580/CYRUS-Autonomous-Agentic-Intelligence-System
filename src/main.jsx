import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep a diagnostic in the browser console without exposing it in the UI.
    console.error("CYRUS workspace render failure", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <section role="alert" aria-live="assertive">
            <p className="eyebrow">WORKSPACE ERROR</p>
            <h1>CYRUS could not render this view.</h1>
            <p>Your saved workflow data remains on the API. Reload the workspace to try again.</p>
            <button className="button-primary" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkspaceErrorBoundary>
      <App />
    </WorkspaceErrorBoundary>
  </React.StrictMode>
);