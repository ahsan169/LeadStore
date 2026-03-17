import { db } from "../db";
import { leads } from "@shared/schema";
import { ilike, or, and, sql } from "drizzle-orm";

export interface CompanySearchParams {
  query?: string;
  industry?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export class CompanySearchService {
  async searchCompanies(params: CompanySearchParams) {
    const {
      query,
      industry,
      state,
      limit = 25,
      offset = 0,
    } = params;

    console.log("[CompanySearch] Searching with params:", params);

    try {
      const conditions = [];

      // Text search
      if (query) {
        conditions.push(
          or(
            ilike(leads.businessName, `%${query}%`),
            ilike(leads.ownerName, `%${query}%`),
            ilike(leads.email, `%${query}%`),
            ilike(leads.industry, `%${query}%`)
          )
        );
      }

      // Industry filter
      if (industry) {
        conditions.push(ilike(leads.industry, `%${industry}%`));
      }

      // State filter  
      if (state) {
        conditions.push(sql`${leads.state} = ${state.toUpperCase()}`);
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(whereClause);

      const total = Number(countResult[0]?.count || 0);

      // Get results
      const results = await db
        .select()
        .from(leads)
        .where(whereClause)
        .orderBy(sql`${leads.qualityScore} DESC`)
        .limit(limit)
        .offset(offset);

      console.log("[CompanySearch] Found", results.length, "results");

      return {
        results,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
      };
    } catch (error) {
      console.error("[CompanySearch] Error:", error);
      throw error;
    }
  }
}

export const companySearchService = new CompanySearchService();
