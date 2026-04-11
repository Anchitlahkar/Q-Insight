const fallbackWebSocketUrl = "ws://localhost:8000/ws";

function normalizeWebSocketUrl(rawUrl: string | undefined) {
  if (!rawUrl) return fallbackWebSocketUrl;
  if (rawUrl.startsWith("ws://") || rawUrl.startsWith("wss://")) return rawUrl;
  if (rawUrl.startsWith("http://")) return `ws://${rawUrl.slice("http://".length)}`;
  if (rawUrl.startsWith("https://")) return `wss://${rawUrl.slice("https://".length)}`;
  return rawUrl;
}

export const webSocketUrl = normalizeWebSocketUrl(process.env.NEXT_PUBLIC_WEBSOCKET_URL);
