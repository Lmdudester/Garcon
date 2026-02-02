// Configuration loaded from environment variables
// Create a .env.local file to override these values (not committed to repo)

export const config = {
  // The host IP/hostname to display for server connections (e.g., Tailscale IP)
  // Defaults to 'localhost' if not specified
  serverHost: import.meta.env.VITE_SERVER_HOST || 'localhost',

  // WebSocket URL for real-time updates
  // If not set, WebSocketContext will auto-detect from window.location
  wsUrl: import.meta.env.VITE_WS_URL || '',
};
