import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { db } from '../db';
import { users, leads } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { eventBus, ServiceEventType } from './event-bus';

export enum WebSocketEventType {
  // Lead events
  LEAD_UPDATED = 'lead:updated',
  LEAD_VERIFIED = 'lead:verified',
  LEAD_ENRICHED = 'lead:enriched',
  LEAD_SCORED = 'lead:scored',
  LEAD_BATCH_PROGRESS = 'lead:batch_progress',
  
  // UCC events
  UCC_ANALYSIS_COMPLETE = 'ucc:analysis_complete',
  UCC_NEW_FILING = 'ucc:new_filing',
  
  // System events
  SYSTEM_NOTIFICATION = 'system:notification',
  SYSTEM_ALERT = 'system:alert',
  
  // Market events
  MARKET_UPDATE = 'market:update',
  MARKET_TREND = 'market:trend',
  
  // User events
  USER_ACTIVITY = 'user:activity',
  USER_NOTIFICATION = 'user:notification'
}

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: any;
  timestamp: Date;
  userId?: string;
  metadata?: any;
}

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  role: string;
  subscriptions: Set<string>;
  isAlive: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Real-time WebSocket service for live data updates
 * Provides bi-directional communication for instant updates
 */
export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ClientConnection> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  // Performance metrics
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    averageLatency: 0,
    reconnections: 0
  };
  
  constructor() {
    super();
    this.initializeEventListeners();
  }
  
  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    console.log('[WebSocket] Initializing WebSocket server...');
    
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      }
    });
    
    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
    
    console.log('[WebSocket] WebSocket server initialized');
  }
  
  /**
   * Initialize event listeners for service events
   */
  private initializeEventListeners(): void {
    // Listen to service events and broadcast to clients
    eventBus.onEvent('lead:updated' as any, (event: any) => {
      this.broadcastToSubscribers(`lead:${event.leadId}`, {
        type: WebSocketEventType.LEAD_UPDATED,
        payload: event,
        timestamp: new Date()
      });
    });
    
    eventBus.onEvent('lead:verified' as any, (event: any) => {
      this.broadcastToSubscribers(`lead:${event.leadId}`, {
        type: WebSocketEventType.LEAD_VERIFIED,
        payload: event,
        timestamp: new Date()
      });
    });
    
    eventBus.onEvent('lead:enriched' as any, (event: any) => {
      this.broadcastToSubscribers(`lead:${event.leadId}`, {
        type: WebSocketEventType.LEAD_ENRICHED,
        payload: event,
        timestamp: new Date()
      });
    });
    
    eventBus.onEvent('lead:scored' as any, (event: any) => {
      this.broadcastToSubscribers(`lead:${event.leadId}`, {
        type: WebSocketEventType.LEAD_SCORED,
        payload: event,
        timestamp: new Date()
      });
    });
    
    eventBus.onEvent(ServiceEventType.UCC_ANALYSIS_COMPLETE, (event) => {
      this.broadcastToSubscribers(`lead:${event.leadId}`, {
        type: WebSocketEventType.UCC_ANALYSIS_COMPLETE,
        payload: event,
        timestamp: new Date()
      });
    });
  }
  
  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    console.log('[WebSocket] New connection attempt');
    
    // Extract user info from request (this would typically come from session/JWT)
    const userId = this.extractUserId(request);
    if (!userId) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    
    // Fetch user details
    const user = await this.getUserDetails(userId);
    if (!user) {
      ws.close(1008, 'User not found');
      return;
    }
    
    const connectionId = `conn_${userId}_${Date.now()}`;
    const connection: ClientConnection = {
      ws,
      userId,
      role: user.role,
      subscriptions: new Set(),
      isAlive: true,
      connectedAt: new Date(),
      lastActivity: new Date()
    };
    
    this.connections.set(connectionId, connection);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    
    // Send connection confirmation
    this.sendToClient(connection, {
      type: WebSocketEventType.SYSTEM_NOTIFICATION,
      payload: {
        message: 'Connected to real-time updates',
        connectionId,
        serverTime: new Date()
      },
      timestamp: new Date()
    });
    
    // Send any queued messages
    this.sendQueuedMessages(userId, connection);
    
    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', () => this.handleDisconnect(connectionId));
    ws.on('error', (error) => this.handleError(connectionId, error));
    ws.on('pong', () => this.handlePong(connectionId));
    
    console.log(`[WebSocket] User ${userId} connected (${connectionId})`);
    this.emit('client-connected', { userId, connectionId });
  }
  
  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(connectionId: string, data: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    connection.lastActivity = new Date();
    this.metrics.messagesReceived++;
    
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Received message from ${connection.userId}:`, message.type);
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(connectionId, message.channels);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribe(connectionId, message.channels);
          break;
          
        case 'ping':
          this.sendToClient(connection, {
            type: WebSocketEventType.SYSTEM_NOTIFICATION,
            payload: { type: 'pong', timestamp: Date.now() },
            timestamp: new Date()
          });
          break;
          
        case 'request_update':
          await this.handleUpdateRequest(connection, message.target, message.targetId);
          break;
          
        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
      
    } catch (error) {
      console.error(`[WebSocket] Error handling message:`, error);
      this.sendToClient(connection, {
        type: WebSocketEventType.SYSTEM_ALERT,
        payload: { error: 'Invalid message format' },
        timestamp: new Date()
      });
    }
  }
  
  /**
   * Handle subscription request
   */
  private handleSubscribe(connectionId: string, channels: string[]): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    channels.forEach(channel => {
      connection.subscriptions.add(channel);
      
      // Add to room
      if (!this.rooms.has(channel)) {
        this.rooms.set(channel, new Set());
      }
      this.rooms.get(channel)!.add(connectionId);
      
      console.log(`[WebSocket] ${connection.userId} subscribed to ${channel}`);
    });
    
    this.sendToClient(connection, {
      type: WebSocketEventType.SYSTEM_NOTIFICATION,
      payload: {
        message: 'Subscribed successfully',
        channels
      },
      timestamp: new Date()
    });
  }
  
  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(connectionId: string, channels: string[]): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    channels.forEach(channel => {
      connection.subscriptions.delete(channel);
      
      // Remove from room
      const room = this.rooms.get(channel);
      if (room) {
        room.delete(connectionId);
        if (room.size === 0) {
          this.rooms.delete(channel);
        }
      }
      
      console.log(`[WebSocket] ${connection.userId} unsubscribed from ${channel}`);
    });
    
    this.sendToClient(connection, {
      type: WebSocketEventType.SYSTEM_NOTIFICATION,
      payload: {
        message: 'Unsubscribed successfully',
        channels
      },
      timestamp: new Date()
    });
  }
  
  /**
   * Handle update request for specific data
   */
  private async handleUpdateRequest(
    connection: ClientConnection,
    target: string,
    targetId: string
  ): Promise<void> {
    try {
      let data: any = null;
      
      switch (target) {
        case 'lead':
          const [lead] = await db
            .select()
            .from(leads)
            .where(eq(leads.id, targetId))
            .limit(1);
          data = lead;
          break;
          
        // Add other targets as needed
      }
      
      if (data) {
        this.sendToClient(connection, {
          type: WebSocketEventType.LEAD_UPDATED,
          payload: data,
          timestamp: new Date(),
          metadata: { requested: true }
        });
      }
    } catch (error) {
      console.error(`[WebSocket] Error handling update request:`, error);
    }
  }
  
  /**
   * Handle client disconnect
   */
  private handleDisconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Remove from all rooms
    connection.subscriptions.forEach(channel => {
      const room = this.rooms.get(channel);
      if (room) {
        room.delete(connectionId);
        if (room.size === 0) {
          this.rooms.delete(channel);
        }
      }
    });
    
    this.connections.delete(connectionId);
    this.metrics.activeConnections--;
    
    console.log(`[WebSocket] User ${connection.userId} disconnected (${connectionId})`);
    this.emit('client-disconnected', { userId: connection.userId, connectionId });
  }
  
  /**
   * Handle WebSocket error
   */
  private handleError(connectionId: string, error: Error): void {
    console.error(`[WebSocket] Connection error for ${connectionId}:`, error);
    this.handleDisconnect(connectionId);
  }
  
  /**
   * Handle pong response
   */
  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = true;
    }
  }
  
  /**
   * Send message to specific client
   */
  private sendToClient(connection: ClientConnection, message: WebSocketMessage): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
        this.metrics.messagesSent++;
      } catch (error) {
        console.error(`[WebSocket] Error sending message to ${connection.userId}:`, error);
      }
    } else {
      // Queue message if connection is not open
      this.queueMessage(connection.userId, message);
    }
  }
  
  /**
   * Broadcast message to all subscribers of a channel
   */
  broadcastToSubscribers(channel: string, message: WebSocketMessage): void {
    const room = this.rooms.get(channel);
    if (!room) return;
    
    room.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendToClient(connection, message);
      }
    });
    
    console.log(`[WebSocket] Broadcasted to ${room.size} clients in channel ${channel}`);
  }
  
  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(message: WebSocketMessage): void {
    this.connections.forEach(connection => {
      this.sendToClient(connection, message);
    });
    
    console.log(`[WebSocket] Broadcasted to all ${this.connections.size} clients`);
  }
  
  /**
   * Broadcast message to users with specific role
   */
  broadcastToRole(role: string, message: WebSocketMessage): void {
    let count = 0;
    this.connections.forEach(connection => {
      if (connection.role === role) {
        this.sendToClient(connection, message);
        count++;
      }
    });
    
    console.log(`[WebSocket] Broadcasted to ${count} clients with role ${role}`);
  }
  
  /**
   * Queue message for offline user
   */
  private queueMessage(userId: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, []);
    }
    
    const queue = this.messageQueue.get(userId)!;
    queue.push(message);
    
    // Limit queue size
    if (queue.length > 100) {
      queue.shift(); // Remove oldest message
    }
  }
  
  /**
   * Send queued messages to reconnected user
   */
  private sendQueuedMessages(userId: string, connection: ClientConnection): void {
    const queue = this.messageQueue.get(userId);
    if (queue && queue.length > 0) {
      console.log(`[WebSocket] Sending ${queue.length} queued messages to ${userId}`);
      
      queue.forEach(message => {
        this.sendToClient(connection, message);
      });
      
      this.messageQueue.delete(userId);
    }
  }
  
  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, connectionId) => {
        if (!connection.isAlive) {
          console.log(`[WebSocket] Terminating inactive connection ${connectionId}`);
          connection.ws.terminate();
          this.handleDisconnect(connectionId);
          return;
        }
        
        connection.isAlive = false;
        connection.ws.ping();
      });
    }, 30000); // Ping every 30 seconds
  }
  
  /**
   * Extract user ID from request (simplified - should use JWT/session)
   */
  private extractUserId(request: any): string | null {
    // This would typically extract from JWT token or session
    // For now, return a mock user ID
    const url = new URL(request.url, `http://${request.headers.host}`);
    return url.searchParams.get('userId') || null;
  }
  
  /**
   * Get user details from database
   */
  private async getUserDetails(userId: string): Promise<any> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return user;
    } catch (error) {
      console.error(`[WebSocket] Error fetching user details:`, error);
      return null;
    }
  }
  
  /**
   * Get WebSocket metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }
  
  /**
   * Get active connections count
   */
  getActiveConnections(): number {
    return this.connections.size;
  }
  
  /**
   * Shutdown WebSocket server gracefully
   */
  shutdown(): void {
    console.log('[WebSocket] Shutting down WebSocket server...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Close all connections
    this.connections.forEach((connection, connectionId) => {
      connection.ws.close(1001, 'Server shutting down');
    });
    
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('[WebSocket] WebSocket server shutdown complete');
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();