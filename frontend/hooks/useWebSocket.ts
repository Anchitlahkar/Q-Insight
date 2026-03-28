"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SerializedCircuit, SimulationResult, SocketStatus } from "@/lib/types";

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

export const useWebSocket = (url: string) => {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const skipReconnectRef = useRef(false);
  const pendingRequestsRef = useRef<PendingRequest[]>([]);
  const reconnectAttemptsRef = useRef(0);

  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<number | null>(null);

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const connect = useCallback(() => {
    clearReconnectTimer();
    setStatus("connecting");

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setStatus((current) => (current === "running" ? current : "connected"));
      setError(null);
      setStatusMessage("Connected");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ResultEnvelope | ErrorEnvelope | StatusEnvelope;

        if (message.type === "status") {
          setStatusMessage(message.message);
          setStatus("running");
          setIsLoading(true);
          return;
        }

        if (message.type === "result") {
          const pending = pendingRequestsRef.current.shift();
          if (pending) {
            setLatencyMs(Math.round(performance.now() - pending.sentAt));
            pending.resolve(message.payload);
          }
          setIsLoading(pendingRequestsRef.current.length > 0);
          setStatus(pendingRequestsRef.current.length > 0 ? "running" : "connected");
          setStatusMessage("Completed");
          setLastCompletedAt(Date.now());
          return;
        }

        if (message.type === "error") {
          const pending = pendingRequestsRef.current.shift();
          pending?.reject(new Error(message.message));
          setError(message.message);
          setStatus("error");
          setStatusMessage(message.message);
          setIsLoading(pendingRequestsRef.current.length > 0);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to parse WebSocket message.");
        setStatus("error");
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setError("WebSocket connection error.");
      setStatusMessage("Connection error");
    };

    socket.onclose = () => {
      setStatus("disconnected");
      setStatusMessage("Disconnected");

      if (!shouldReconnectRef.current || skipReconnectRef.current) {
        skipReconnectRef.current = false;
        return;
      }

      const backoff = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 8000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = window.setTimeout(connect, backoff);
    };
  }, [url]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      socketRef.current?.close();
      pendingRequestsRef.current.forEach((pending) =>
        pending.reject(new Error("WebSocket connection closed."))
      );
      pendingRequestsRef.current = [];
    };
  }, [connect]);

  const sendJson = useCallback((payload: SerializedCircuit) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }

    socket.send(JSON.stringify(payload));
  }, []);

  const simulateCircuit = useCallback(
    (payload: SerializedCircuit) =>
      new Promise<SimulationResult>((resolve, reject) => {
        try {
          pendingRequestsRef.current.push({ sentAt: performance.now(), resolve, reject });
          setLatencyMs(null);
          setStatus("running");
          setStatusMessage("Sending circuit");
          sendJson(payload);
          setIsLoading(true);
        } catch (caughtError) {
          pendingRequestsRef.current.pop();
          reject(caughtError);
        }
      }),
    [sendJson]
  );

  const reconnect = useCallback(() => {
    skipReconnectRef.current = true;
    clearReconnectTimer();
    socketRef.current?.close();
    connect();
  }, [connect]);

  return {
    status,
    error,
    isLoading,
    statusMessage,
    latencyMs,
    lastCompletedAt,
    reconnect,
    sendJson,
    simulateCircuit
  };
};

