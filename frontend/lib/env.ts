const fallbackWebSocketUrl = "ws://localhost:8000/ws";

export const webSocketUrl =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? fallbackWebSocketUrl;
