const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "Request failed");
    throw new Error(message || ("Request failed: " + response.status));
  }
  return response.json();
}

export const api = {
  health: () => request("/api/health"),
  agents: () => request("/api/agents"),
  runs: () => request("/api/runs"),
  createRun: (goal) => request("/api/runs", {
    method: "POST",
    body: JSON.stringify({ goal }),
  }),
};