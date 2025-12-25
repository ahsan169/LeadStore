import crypto from "crypto";
import { storage } from "../storage";
import type { Request, Response, NextFunction } from "express";
import type { ApiKey, Webhook, InsertApiUsage } from "@shared/schema";

// Rate limiter using in-memory store (can be replaced with Redis in production)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async isAllowed(key: string, limit: number, windowMs: number = 60000): Promise<boolean> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// Webhook event types
export type WebhookEvent = 
  | "lead.created"
  | "lead.updated"
  | "lead.sold"
  | "purchase.completed"
  | "purchase.failed"
  | "credit.added"
  | "credit.used"
  | "batch.uploaded"
  | "batch.processed"
  | "alert.triggered"
  | "quality.reported"
  | "quality.resolved";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
}

class WebhookDispatcher {
  async dispatch(event: WebhookEvent, data: any): Promise<void> {
    try {
      const webhooks = await storage.getActiveWebhooksByEvent(event);
      
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };

      // Send webhooks asynchronously
      const promises = webhooks.map(webhook => this.sendWebhook(webhook, payload));
      await Promise.allSettled(promises);
    } catch (error) {
      console.error("[WebhookDispatcher] Error dispatching webhooks:", error);
    }
  }

  private async sendWebhook(webhook: Webhook, payload: WebhookPayload): Promise<void> {
    try {
      // Generate signature for webhook validation
      const signature = this.generateSignature(webhook.secret, payload);
      
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": payload.event,
          "X-Webhook-Timestamp": payload.timestamp
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const status = response.ok ? "success" : "failed";
      await storage.updateWebhookDelivery(webhook.id, status);
      
      if (!response.ok) {
        console.error(`[WebhookDispatcher] Failed to send webhook to ${webhook.url}: ${response.status}`);
      }
    } catch (error) {
      await storage.updateWebhookDelivery(webhook.id, "failed");
      console.error(`[WebhookDispatcher] Error sending webhook to ${webhook.url}:`, error);
    }
  }

  private generateSignature(secret: string, payload: WebhookPayload): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest("hex");
  }
}

class ApiKeyManager {
  generateApiKey(): string {
    // Generate a secure random API key
    const prefix = "lol_live_"; // Land of Leads live key prefix
    const randomBytes = crypto.randomBytes(32).toString("hex");
    return `${prefix}${randomBytes}`;
  }

  hashApiKey(apiKey: string): string {
    // Hash the API key for secure storage
    return crypto.createHash("sha256").update(apiKey).digest("hex");
  }

  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
    const keyHash = this.hashApiKey(apiKey);
    const apiKeyRecord = await storage.getApiKeyByHash(keyHash);
    
    if (!apiKeyRecord) {
      return null;
    }

    // Check if key is expired
    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
      return null;
    }

    // Update last used timestamp
    await storage.updateApiKeyLastUsed(apiKeyRecord.id);

    return apiKeyRecord;
  }

  hasPermission(apiKey: ApiKey, scope: string): boolean {
    const permissions = apiKey.permissions as any;
    if (!permissions || !permissions.scopes) {
      return false;
    }
    return permissions.scopes.includes(scope);
  }

  hasEndpointAccess(apiKey: ApiKey, endpoint: string): boolean {
    const permissions = apiKey.permissions as any;
    if (!permissions || !permissions.endpoints) {
      return true; // If no specific endpoints are set, allow all
    }
    return permissions.endpoints.includes(endpoint);
  }
}

// Extend Express Request type to include API context
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiContext?: {
        startTime: number;
        responseSize?: number;
      };
    }
  }
}

// API Authentication Middleware
export function apiAuthMiddleware(requiredScopes?: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Missing or invalid authorization header" 
      });
    }

    const apiKey = authHeader.substring(7);
    const apiKeyManager = new ApiKeyManager();
    const apiKeyRecord = await apiKeyManager.validateApiKey(apiKey);

    if (!apiKeyRecord) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Invalid or expired API key" 
      });
    }

    // Check required scopes
    if (requiredScopes) {
      for (const scope of requiredScopes) {
        if (!apiKeyManager.hasPermission(apiKeyRecord, scope)) {
          return res.status(403).json({ 
            error: "Forbidden", 
            message: `Missing required scope: ${scope}` 
          });
        }
      }
    }

    // Check endpoint access
    const endpoint = req.path;
    if (!apiKeyManager.hasEndpointAccess(apiKeyRecord, endpoint)) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: "Access to this endpoint is not allowed" 
      });
    }

    req.apiKey = apiKeyRecord;
    req.apiContext = { startTime: Date.now() };
    next();
  };
}

// Rate Limiting Middleware
const rateLimiter = new RateLimiter();

export function rateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return next();
    }

    const limit = req.apiKey.rateLimit || 100;
    const allowed = await rateLimiter.isAllowed(req.apiKey.id, limit);

    if (!allowed) {
      return res.status(429).json({ 
        error: "Too Many Requests", 
        message: `Rate limit exceeded. Maximum ${limit} requests per minute.`,
        retryAfter: 60
      });
    }

    res.setHeader("X-RateLimit-Limit", limit.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - 1).toString());
    res.setHeader("X-RateLimit-Reset", new Date(Date.now() + 60000).toISOString());

    next();
  };
}

// API Usage Tracking Middleware
export function usageTrackingMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey || !req.apiContext) {
      return next();
    }

    // Capture response data
    const originalSend = res.send;
    res.send = function(data: any) {
      if (req.apiContext) {
        req.apiContext.responseSize = Buffer.byteLength(data);
      }
      return originalSend.call(this, data);
    };

    // Log usage after response
    res.on("finish", async () => {
      try {
        const responseTime = Date.now() - req.apiContext!.startTime;
        
        const usage: InsertApiUsage = {
          apiKeyId: req.apiKey!.id,
          endpoint: req.path,
          method: req.method as any,
          statusCode: res.statusCode,
          responseTime,
          responseSize: req.apiContext?.responseSize,
          ipAddress: req.ip || undefined,
          userAgent: req.headers["user-agent"] || undefined
        };

        await storage.createApiUsage(usage);
      } catch (error) {
        console.error("[UsageTracking] Error logging API usage:", error);
      }
    });

    next();
  };
}

// API Response Helper
export function apiResponse(res: Response, data: any, statusCode = 200) {
  res.status(statusCode).json({
    success: statusCode < 400,
    data,
    timestamp: new Date().toISOString()
  });
}

export function apiError(res: Response, message: string, statusCode = 400, details?: any) {
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      details,
      timestamp: new Date().toISOString()
    }
  });
}

// Pagination Helper
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export function parsePagination(query: any): PaginationOptions {
  return {
    page: Math.max(1, parseInt(query.page) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
    sort: query.sort || "createdAt",
    order: query.order === "asc" ? "asc" : "desc"
  };
}

export function paginatedResponse(res: Response, data: any[], total: number, options: PaginationOptions) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const totalPages = Math.ceil(total / limit);
  
  res.status(200).json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
}

// Export singleton instances
export const webhookDispatcher = new WebhookDispatcher();
export const apiKeyManager = new ApiKeyManager();

// Cleanup function for graceful shutdown
export function cleanup() {
  rateLimiter.destroy();
}