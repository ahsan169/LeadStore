import { Request, Response, NextFunction } from "express";

// Role types for the multi-tenant CRM
export type UserRole = "super_admin" | "company_admin" | "agent" | "admin" | "buyer";

// Extend Express Request type to include session with company context
declare module "express-serve-static-core" {
  interface Request {
    session: {
      userId?: string;
      userRole?: UserRole;
      companyId?: string;
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
 * Middleware to ensure user is a super_admin (platform-wide access)
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.session.userRole !== "super_admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  
  next();
}

/**
 * Middleware to ensure user is a company_admin or higher
 */
export function requireCompanyAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const role = req.session.userRole;
  if (role !== "super_admin" && role !== "company_admin") {
    return res.status(403).json({ error: "Company admin access required" });
  }
  
  next();
}

/**
 * Middleware to ensure user has access to company data (any authenticated company user)
 */
export function requireCompanyAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const role = req.session.userRole;
  const validRoles: UserRole[] = ["super_admin", "company_admin", "agent"];
  
  if (!validRoles.includes(role as UserRole)) {
    return res.status(403).json({ error: "Company access required" });
  }
  
  // For non-super_admin users, ensure they have a company assigned
  if (role !== "super_admin" && !req.session.companyId) {
    return res.status(403).json({ error: "User not assigned to a company" });
  }
  
  next();
}

/**
 * Legacy middleware for backward compatibility - ensure user is an admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const role = req.session.userRole;
  // Accept both new super_admin and legacy admin roles
  if (role !== "admin" && role !== "super_admin" && role !== "company_admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
}

/**
 * Legacy middleware for backward compatibility - ensure user is a buyer
 */
export function requireBuyer(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const role = req.session.userRole;
  // Accept both new agent role and legacy buyer role
  if (role !== "buyer" && role !== "agent") {
    return res.status(403).json({ error: "Buyer access required" });
  }
  
  next();
}

/**
 * Middleware to check if user is authenticated (without requiring it)
 */
export function checkAuth(req: Request, res: Response, next: NextFunction) {
  next();
}

/**
 * Helper to get the company ID for queries
 * Returns undefined for super_admin (allowing access to all companies)
 * Returns the user's companyId for other roles
 */
export function getCompanyScope(req: Request): string | undefined {
  if (req.session.userRole === "super_admin") {
    // Super admin can access all companies - use query param if provided
    return req.query.companyId as string | undefined;
  }
  return req.session.companyId;
}

/**
 * Middleware to validate company scope for routes that need it
 * Ensures company context is available
 */
export function requireCompanyScope(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const companyId = getCompanyScope(req);
  
  // Super admin without specific company scope is allowed
  if (req.session.userRole === "super_admin") {
    next();
    return;
  }
  
  // Other roles must have a company scope
  if (!companyId) {
    return res.status(403).json({ error: "Company context required" });
  }
  
  next();
}
