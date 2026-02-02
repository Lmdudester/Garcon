// Configuration loaded from environment variables
// Create a .env.local file to override these values (not committed to repo)

export const config = {
  // The host IP/hostname to display for server connections (e.g., Tailscale IP)
  // Auto-detects from current URL, or override with VITE_SERVER_HOST
  serverHost: import.meta.env.VITE_SERVER_HOST || window.location.hostname,

  // WebSocket URL for real-time updates
  // If not set, WebSocketContext will auto-detect from window.location
  wsUrl: import.meta.env.VITE_WS_URL || '',
};
