/**
 * WebSocket real-time updates are disabled (HTTP polling / REST only).
 * Call sites keep importing this module; broadcasts are no-ops.
 */
import type { Server } from "http";

export enum WebSocketEventType {
  LEAD_UPDATED = "lead:updated",
  LEAD_VERIFIED = "lead:verified",
  LEAD_ENRICHED = "lead:enriched",
  LEAD_SCORED = "lead:scored",
  LEAD_BATCH_PROGRESS = "lead:batch_progress",
  UCC_ANALYSIS_COMPLETE = "ucc:analysis_complete",
  UCC_NEW_FILING = "ucc:new_filing",
  SYSTEM_NOTIFICATION = "system:notification",
  SYSTEM_ALERT = "system:alert",
  MARKET_UPDATE = "market:update",
  MARKET_TREND = "market:trend",
  USER_ACTIVITY = "user:activity",
  USER_NOTIFICATION = "user:notification",
}

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: unknown;
  timestamp: Date;
  userId?: string;
  metadata?: unknown;
}

class WebSocketServiceStub {
  initialize(_server: Server): void {}

  broadcastToSubscribers(_channel: string, _message: WebSocketMessage): void {}

  broadcastToAll(_message: WebSocketMessage): void {}

  broadcastToRole(_role: string, _message: WebSocketMessage): void {}

  shutdown(): void {}
}

export const webSocketService = new WebSocketServiceStub();
