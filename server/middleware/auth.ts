import { Request, Response, NextFunction } from "express";

// Extend Express Request type to include session
declare module "express-serve-static-core" {
  interface Request {
    session: {
      userId?: string;
      userRole?: "buyer" | "admin";
      [key: string]: any;
    };
  }
}

/**
 * Middleware to ensure user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Middleware to ensure user is an admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
}

/**
 * Middleware to ensure user is a buyer
 */
export function requireBuyer(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.session.userRole !== "buyer") {
    return res.status(403).json({ error: "Buyer access required" });
  }
  
  next();
}

/**
 * Middleware to check if user is authenticated (without requiring it)
 */
export function checkAuth(req: Request, res: Response, next: NextFunction) {
  // This middleware just checks authentication without blocking
  // The userId and userRole will be available in req.session if authenticated
  next();
}