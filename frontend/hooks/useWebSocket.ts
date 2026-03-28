"use client";

import { useCallback, useEffect, useState } from "react";
import { SimulationRequest, SimulationResult, SocketStatus } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

type ResultEnvelope = {
  type: "result";
  payload: SimulationResult;
};

type ErrorEnvelope = {
  type: "error";
  message: string;
};

type StatusEnvelope = {
  type: "status";
  message: string;
};

type PendingRequest = {
  sentAt: number;
  resolve: (value: SimulationResult) => void;
  reject: (reason?: unknown) => void;
};

type SharedSocketState = {
  status: SocketStatus;
  error: string | null;
  isLoading: boolean;
  statusMessage: string | null;
  latencyMs: number | null;
  lastCompletedAt: number | null;
};

const listeners = new Set<(state: SharedSocketState) => void>();
const pendingRequests: PendingRequest[] = [];
let sharedSocket: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let reconnectAttempts = 0;
let activeUrl: string | null = null;
let shouldReconnect = true;
let skipReconnect = false;

let sharedState: SharedSocketState = {
  status: "connecting",
  error: null,
  isLoading: false,
  statusMessage: null,
  latencyMs: null,
  lastCompletedAt: null,
};

function emit() {
  listeners.forEach((listener) => listener(sharedState));
}

function setSharedState(patch: Partial<SharedSocketState>) {
  sharedState = { ...sharedState, ...patch };
  emit();
}

function syncSocket(socket: WebSocket | null) {
  useCircuitStore.getState().setSocket(socket);
}

function clearReconnectTimer() {
  if (reconnectTimeout !== null) {
    window.clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function rejectPending(reason: Error) {
  while (pendingRequests.length) {
    pendingRequests.shift()?.reject(reason);
  }
}

function connect(url: string) {
  activeUrl = url;
  clearReconnectTimer();

  if (sharedSocket && (sharedSocket.readyState === WebSocket.OPEN || sharedSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setSharedState({ status: "connecting" });

  const socket = new WebSocket(url);
  sharedSocket = socket;
  syncSocket(socket);

  socket.onopen = () => {
    reconnectAttempts = 0;
    setSharedState({
      status: pendingRequests.length > 0 ? "running" : "connected",
      error: null,
      statusMessage: "Connected",
    });
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as ResultEnvelope | ErrorEnvelope | StatusEnvelope;

      if (message.type === "status") {
        setSharedState({
          status: "running",
          isLoading: true,
          statusMessage: message.message,
        });
        return;
      }

      if (message.type === "result") {
        const pending = pendingRequests.shift();
        if (pending) {
          pending.resolve(message.payload);
          setSharedState({ latencyMs: Math.round(performance.now() - pending.sentAt) });
        }
        setSharedState({
          isLoading: pendingRequests.length > 0,
          status: pendingRequests.length > 0 ? "running" : "connected",
          statusMessage: "Completed",
          lastCompletedAt: Date.now(),
        });
        return;
      }

      if (message.type === "error") {
        pendingRequests.shift()?.reject(new Error(message.message));
        setSharedState({
          error: message.message,
          status: "error",
          statusMessage: message.message,
          isLoading: pendingRequests.length > 0,
        });
      }
    } catch (caughtError) {
      setSharedState({
        error: caughtError instanceof Error ? caughtError.message : "Unable to parse WebSocket message.",
        status: "error",
      });
    }
  };

  socket.onerror = () => {
    setSharedState({
      status: "error",
      error: "WebSocket connection error.",
      statusMessage: "Connection error",
    });
  };

  socket.onclose = () => {
    sharedSocket = null;
    syncSocket(null);
    setSharedState({
      status: "disconnected",
      statusMessage: "Disconnected",
      isLoading: false,
    });

    if (!shouldReconnect || skipReconnect || listeners.size === 0 || !activeUrl) {
      skipReconnect = false;
      rejectPending(new Error("WebSocket connection closed."));
      return;
    }

    const backoff = Math.min(1000 * 2 ** reconnectAttempts, 8000);
    reconnectAttempts += 1;
    reconnectTimeout = window.setTimeout(() => connect(activeUrl!), backoff);
  };
}

function disconnectIfUnused() {
  if (listeners.size > 0) return;
  shouldReconnect = false;
  skipReconnect = true;
  clearReconnectTimer();
  sharedSocket?.close();
  sharedSocket = null;
  syncSocket(null);
}

export const useWebSocket = (url: string) => {
  const [localState, setLocalState] = useState<SharedSocketState>(sharedState);

  useEffect(() => {
    shouldReconnect = true;
    listeners.add(setLocalState);
    setLocalState(sharedState);
    connect(url);

    return () => {
      listeners.delete(setLocalState);
      disconnectIfUnused();
    };
  }, [url]);

  const sendJson = useCallback((payload: SimulationRequest) => {
    const socket = sharedSocket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }

    socket.send(JSON.stringify(payload));
  }, []);

  const simulateCircuit = useCallback(
    (payload: SimulationRequest) =>
      new Promise<SimulationResult>((resolve, reject) => {
        try {
          pendingRequests.push({ sentAt: performance.now(), resolve, reject });
          setSharedState({
            latencyMs: null,
            status: "running",
            statusMessage: "Sending circuit",
            isLoading: true,
            error: null,
          });
          sendJson(payload);
        } catch (caughtError) {
          pendingRequests.pop();
          reject(caughtError);
        }
      }),
    [sendJson]
  );

  const reconnect = useCallback(() => {
    if (!activeUrl) return;
    skipReconnect = true;
    clearReconnectTimer();
    sharedSocket?.close();
    skipReconnect = false;
    connect(activeUrl);
  }, []);

  return {
    ...localState,
    reconnect,
    sendJson,
    simulateCircuit
  };
};
