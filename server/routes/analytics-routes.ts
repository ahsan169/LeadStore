import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

interface SearchAnalytics {
  totalSearches: number;
  totalCompaniesFound: number;
  csvDownloads: number;
  bulkUploads: number;
  averageCompaniesPerSearch: number;
  topSearchedTerms: Array<{ term: string; count: number }>;
  searchSuccessRate: number;
  totalExecutivesFound: number;
}

// In-memory tracking for search analytics (can be moved to database later)
const searchStats = {
  searches: [] as Array<{ term: string; timestamp: Date; companiesFound: number }>,
  csvDownloads: 0,
  bulkUploads: 0,
};

export function registerAnalyticsRoutes(app: Express) {
  // Track search activity
  app.post("/api/analytics/track-search", async (req, res) => {
    try {
      const { searchTerm, companiesFound } = req.body;
      
      if (searchTerm) {
        searchStats.searches.push({
          term: searchTerm,
          timestamp: new Date(),
          companiesFound: companiesFound || 0,
        });
        
        // Keep only last 1000 searches to prevent memory issues
        if (searchStats.searches.length > 1000) {
          searchStats.searches = searchStats.searches.slice(-1000);
        }
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Track CSV download
  app.post("/api/analytics/track-download", async (req, res) => {
    try {
      searchStats.csvDownloads++;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Track bulk upload
  app.post("/api/analytics/track-bulk-upload", async (req, res) => {
    try {
      searchStats.bulkUploads++;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get search statistics
  app.get("/api/analytics/search-stats", async (req, res) => {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Filter searches from last 30 days
      const recentSearches = searchStats.searches.filter(
        s => s.timestamp >= last30Days
      );
      
      const totalSearches = recentSearches.length;
      const totalCompaniesFound = recentSearches.reduce(
        (sum, s) => sum + s.companiesFound,
        0
      );
      
      // Calculate top searched terms
      const termCounts: Record<string, number> = {};
      recentSearches.forEach(s => {
        termCounts[s.term] = (termCounts[s.term] || 0) + 1;
      });
      
      const topSearchedTerms = Object.entries(termCounts)
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      const averageCompaniesPerSearch = totalSearches > 0
        ? Math.round((totalCompaniesFound / totalSearches) * 10) / 10
        : 0;
      
      const searchSuccessRate = totalSearches > 0
        ? Math.round((recentSearches.filter(s => s.companiesFound > 0).length / totalSearches) * 100)
        : 0;
      
      // Estimate executives found (assuming average 2-3 executives per company)
      const totalExecutivesFound = Math.round(totalCompaniesFound * 2.5);
      
      const analytics: SearchAnalytics = {
        totalSearches,
        totalCompaniesFound,
        csvDownloads: searchStats.csvDownloads,
        bulkUploads: searchStats.bulkUploads,
        averageCompaniesPerSearch,
        topSearchedTerms,
        searchSuccessRate,
        totalExecutivesFound,
      };
      
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}





