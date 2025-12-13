import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  const root = createRoot(rootElement);
  root.render(<App />);
} catch (error) {
  console.error("Failed to render app:", error);
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0e27; color: white; font-family: Verdana, sans-serif;">
      <div style="text-align: center; padding: 2rem;">
        <h1 style="color: #ef4444; margin-bottom: 1rem;">Failed to load application</h1>
        <p style="color: #94a3b8; margin-bottom: 1rem;">${error instanceof Error ? error.message : "Unknown error"}</p>
        <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #9945ff; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">
          Reload Page
        </button>
      </div>
    </div>
  `;
}
