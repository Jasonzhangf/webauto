/**
 * Inter-process communication and WebSocket management
 * Handles communication between daemon components and external clients
 */

import EventEmitter from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  WebSocketMessage,
  DaemonEvent
} from '../types';

interface ClientConnection {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPing: Date;
  subscriptions: Set<string>;
  metadata?: Record<string, any>;
}

export class CommunicationManager extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private wsServer?: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config);
  }

  /**
   * Initialize the communication manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing communication manager');

      if (this.config.enableWebSocket) {
        await this.startWebSocketServer();
      }

      this.isInitialized = true;
      this.isRunning = true;

      // Start heartbeat for clients
      this.startHeartbeat();

      this.logger.info('Communication manager initialized');

    } catch (error) {
      this.logger.error('Failed to initialize communication manager', { error });
      throw error;
    }
  }

  /**
   * Shutdown the communication manager
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Shutting down communication manager');

    // Stop WebSocket server
    if (this.wsServer) {
      await this.stopWebSocketServer();
    }

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Clear all connections
    this.clients.clear();
    this.messageQueue.clear();

    this.isRunning = false;
    this.logger.info('Communication manager shutdown completed');
  }

  /**
   * Check if communication manager is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }

    // Check WebSocket server if enabled
    if (this.config.enableWebSocket && this.wsServer) {
      try {
        return this.wsServer.readyState === WebSocketServer.OPEN;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Send a message to a specific client
   */
  async send(clientId: string, message: WebSocketMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      this.logger.warn('Attempted to send message to unknown client', { clientId });
      return;
    }

    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify(message));
        client.lastPing = new Date();
        this.logger.debug('Message sent to client', {
          clientId,
          type: message.type,
          timestamp: message.timestamp
        });
      } else {
        // Queue message for later delivery
        this.queueMessage(clientId, message);
      }
    } catch (error) {
      this.logger.error('Failed to send message to client', {
        clientId,
        type: message.type,
        error
      });
      this.removeClient(clientId);
    }
  }

  /**
   * Broadcast a message to all clients
   */
  async broadcast(message: WebSocketMessage, filter?: (client: ClientConnection) => boolean): Promise<void> {
    const sendPromises = Array.from(this.clients.values())
      .filter(client => !filter || filter(client))
      .map(client => this.send(client.id, message));

    await Promise.allSettled(sendPromises);
  }

  /**
   * Send a message to clients subscribed to a specific topic
   */
  async sendToTopic(topic: string, message: WebSocketMessage): Promise<void> {
    const subscribedClients = Array.from(this.clients.values())
      .filter(client => client.subscriptions.has(topic));

    await Promise.allSettled(
      subscribedClients.map(client => this.send(client.id, message))
    );
  }

  /**
   * Subscribe a client to a topic
   */
  async subscribe(clientId: string, topic: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    client.subscriptions.add(topic);
    this.logger.debug('Client subscribed to topic', { clientId, topic });

    // Send confirmation
    await this.send(clientId, {
      type: 'subscription_confirmed',
      payload: { topic },
      timestamp: new Date()
    });
  }

  /**
   * Unsubscribe a client from a topic
   */
  async unsubscribe(clientId: string, topic: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    client.subscriptions.delete(topic);
    this.logger.debug('Client unsubscribed from topic', { clientId, topic });

    // Send confirmation
    await this.send(clientId, {
      type: 'subscription_removed',
      payload: { topic },
      timestamp: new Date()
    });
  }

  /**
   * Get connected clients
   */
  async getConnectedClients(): Promise<ClientConnection[]> {
    return Array.from(this.clients.values());
  }

  /**
   * Get client statistics
   */
  async getStats() {
    const clients = Array.from(this.clients.values());
    const now = new Date();

    return {
      totalClients: clients.length,
      activeClients: clients.filter(c => now.getTime() - c.lastPing.getTime() < 30000).length, // Active in last 30s
      subscriptions: Array.from(new Set(
        clients.flatMap(c => Array.from(c.subscriptions))
      )),
      averageConnectionTime: clients.length > 0
        ? clients.reduce((sum, c) => sum + (now.getTime() - c.connectedAt.getTime()), 0) / clients.length
        : 0,
      messagesQueued: Array.from(this.messageQueue.values())
        .reduce((sum, queue) => sum + queue.length, 0)
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: DaemonConfig): Promise<void> {
    this.logger.info('Updating communication manager configuration', { config });

    const oldConfig = this.config;
    this.config = config;

    // Restart WebSocket server if enabled/disabled status changed
    if (oldConfig.enableWebSocket !== config.enableWebSocket) {
      if (config.enableWebSocket) {
        await this.startWebSocketServer();
      } else {
        await this.stopWebSocketServer();
      }
    }

    // Update WebSocket server if port changed
    if (this.wsServer && oldConfig.port !== config.port) {
      await this.stopWebSocketServer();
      await this.startWebSocketServer();
    }
  }

  /**
   * Start WebSocket server
   */
  private async startWebSocketServer(): Promise<void> {
    if (this.wsServer) {
      return;
    }

    const port = this.config.port || 8080;
    const host = this.config.host || 'localhost';

    try {
      this.wsServer = new WebSocketServer({ port, host });

      this.wsServer.on('connection', (socket: WebSocket) => {
        this.handleConnection(socket);
      });

      this.wsServer.on('error', (error) => {
        this.logger.error('WebSocket server error', { error });
      });

      this.wsServer.on('listening', () => {
        this.logger.info('WebSocket server started', { port, host });
      });

    } catch (error) {
      this.logger.error('Failed to start WebSocket server', { port, host, error });
      throw error;
    }
  }

  /**
   * Stop WebSocket server
   */
  private async stopWebSocketServer(): Promise<void> {
    if (!this.wsServer) {
      return;
    }

    try {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close();
      }

      // Close server
      await new Promise<void>((resolve, reject) => {
        this.wsServer!.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.wsServer = undefined;
      this.logger.info('WebSocket server stopped');

    } catch (error) {
      this.logger.error('Error stopping WebSocket server', { error });
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket): void {
    const clientId = this.generateClientId();
    const client: ClientConnection = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      lastPing: new Date(),
      subscriptions: new Set()
    };

    this.clients.set(clientId, client);

    this.logger.info('Client connected', {
      clientId,
      remoteAddress: socket.readyState === WebSocket.OPEN ? 'unknown' : 'connecting'
    });

    // Send welcome message
    this.send(clientId, {
      type: 'connection_established',
      payload: {
        clientId,
        serverVersion: this.config.version,
        timestamp: new Date()
      },
      timestamp: new Date()
    });

    // Set up message handler
    socket.on('message', (data) => {
      this.handleClientMessage(clientId, data);
    });

    // Set up close handler
    socket.on('close', () => {
      this.removeClient(clientId);
    });

    // Set up error handler
    socket.on('error', (error) => {
      this.logger.error('Client connection error', { clientId, error });
      this.removeClient(clientId);
    });

    // Set up ping/pong
    socket.on('pong', () => {
      client.lastPing = new Date();
    });
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(clientId: string, data: any): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        this.logger.warn('Message from unknown client', { clientId });
        return;
      }

      client.lastPing = new Date();

      this.logger.debug('Message received from client', {
        clientId,
        type: message.type
      });

      // Emit message event for daemon to handle
      this.emit('message:received', {
        ...message,
        source: clientId,
        timestamp: new Date()
      });

      // Handle built-in message types
      this.handleClientMessageType(clientId, message);

    } catch (error) {
      this.logger.error('Failed to handle client message', {
        clientId,
        data: data.toString(),
        error
      });
    }
  }

  /**
   * Handle specific client message types
   */
  private async handleClientMessageType(clientId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'subscribe':
        await this.subscribe(clientId, message.payload.topic);
        break;

      case 'unsubscribe':
        await this.unsubscribe(clientId, message.payload.topic);
        break;

      case 'ping':
        await this.send(clientId, {
          type: 'pong',
          payload: { timestamp: new Date() },
          timestamp: new Date()
        });
        break;

      case 'get_status':
        await this.send(clientId, {
          type: 'status_response',
          payload: {
            connected: true,
            subscriptions: Array.from(this.clients.get(clientId)?.subscriptions || []),
            serverTime: new Date()
          },
          timestamp: new Date()
        });
        break;

      default:
        // Unknown message types are handled by the daemon
        break;
    }
  }

  /**
   * Remove a client connection
   */
  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      client.socket.close();
    } catch {
      // Ignore close errors
    }

    this.clients.delete(clientId);
    this.messageQueue.delete(clientId);

    this.logger.info('Client disconnected', { clientId });
  }

  /**
   * Queue a message for a disconnected client
   */
  private queueMessage(clientId: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(clientId)) {
      this.messageQueue.set(clientId, []);
    }

    const queue = this.messageQueue.get(clientId)!;
    queue.push(message);

    // Limit queue size
    if (queue.length > 100) {
      queue.shift(); // Remove oldest message
    }

    this.logger.debug('Message queued for client', {
      clientId,
      type: message.type,
      queueSize: queue.length
    });
  }

  /**
   * Start heartbeat for client connections
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 1 minute timeout

      // Check for inactive clients
      for (const [clientId, client] of this.clients) {
        if (now.getTime() - client.lastPing.getTime() > timeout) {
          this.logger.warn('Client timeout, removing connection', { clientId });
          this.removeClient(clientId);
        } else {
          // Send ping
          try {
            client.socket.ping();
          } catch (error) {
            this.logger.error('Failed to ping client', { clientId, error });
            this.removeClient(clientId);
          }
        }
      }

      // Clean up empty message queues
      for (const [clientId, queue] of this.messageQueue) {
        if (!this.clients.has(clientId)) {
          this.messageQueue.delete(clientId);
        }
      }

    }, 30000); // Check every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}