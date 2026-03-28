import { Router } from "express";
import { companySearchService } from "../services/company-search-service";
import { seamlessAI } from "../services/seamless-ai-service";
import type { Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Search for companies
 * GET /api/company-search
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      query,
      industry,
      state,
      limit = "25",
      offset = "0",
    } = req.query;

    const searchParams = {
      query: query as string | undefined,
      industry: industry as string | undefined,
      state: state as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    };

    const results = await companySearchService.searchCompanies(searchParams);
    res.json(results);
  } catch (error: any) {
    console.error("[CompanySearch] Search error:", error);
    res.status(500).json({ 
      error: "Failed to search companies",
      message: error.message 
    });
  }
});

/**
 * Get available industries
 * GET /api/company-search/filters/industries
 */
router.get("/filters/industries", async (req: Request, res: Response) => {
  try {
    const industries = await companySearchService.getIndustries();
    res.json({ industries });
  } catch (error: any) {
    console.error("[CompanySearch] Get industries error:", error);
    res.status(500).json({ 
      error: "Failed to get industries",
      message: error.message 
    });
  }
});

/**
 * Get available states
 * GET /api/company-search/filters/states
 */
router.get("/filters/states", async (req: Request, res: Response) => {
  try {
    const states = await companySearchService.getStates();
    res.json({ states });
  } catch (error: any) {
    console.error("[CompanySearch] Get states error:", error);
    res.status(500).json({ 
      error: "Failed to get states",
      message: error.message 
    });
  }
});

/**
 * Get company search statistics
 * GET /api/company-search/stats
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await companySearchService.getStatistics();
    res.json(stats);
  } catch (error: any) {
    console.error("[CompanySearch] Get stats error:", error);
    res.status(500).json({ 
      error: "Failed to get statistics",
      message: error.message 
    });
  }
});

/**
 * Enrich a company with REAL SeamlessAI data
 * POST /api/company-search/enrich
 * Body: { companyName: string, domain?: string }
 */
router.post("/enrich", async (req: Request, res: Response) => {
  try {
    const { companyName, domain } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ error: "Company name is required" });
    }

    // Check if SeamlessAI is configured
    if (!seamlessAI.isConfigured()) {
      return res.status(503).json({ 
        error: "SeamlessAI API not configured",
        message: "Set SEAMLESS_API_KEY environment variable to enable real company enrichment" 
      });
    }

    const ownerOnly = req.body.ownerOnly !== false;
    const maxSearchResults = Math.min(Number(req.body.maxSearchResults) || 15, 50);
    console.log(`[CompanySearch] Enriching company via SeamlessAI: ${companyName}`);
    const enrichedData = await seamlessAI.enrichCompany(companyName, domain, {
      ownerOnly,
      maxSearchResults,
    });

    if (!enrichedData) {
      return res.status(404).json({ 
        error: "Could not find company data",
        message: "No data found for this company in SeamlessAI" 
      });
    }

    res.json(enrichedData);
  } catch (error: any) {
    console.error("[CompanySearch] Enrichment error:", error);
    res.status(500).json({ 
      error: "Failed to enrich company",
      message: error.message 
    });
  }
});

/**
 * Live company search using REAL SeamlessAI API
 * GET /api/company-search/live
 */
router.get("/live", async (req: Request, res: Response) => {
  try {
    const { query, industry, location } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // Check if SeamlessAI is configured
    if (!seamlessAI.isConfigured()) {
      return res.status(503).json({ 
        error: "SeamlessAI API not configured",
        message: "Set SEAMLESS_API_KEY environment variable to enable real company search" 
      });
    }

    console.log(`[CompanySearch] Live SeamlessAI search for: ${query}`);
    const results = await seamlessAI.searchCompanies(
      query as string,
      {
        industry: industry as string | undefined,
        location: location as string | undefined,
      }
    );

    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error("[CompanySearch] Live search error:", error);
    res.status(500).json({ 
      error: "Failed to search companies",
      message: error.message 
    });
  }
});

/**
 * Export companies and contacts to CSV
 * POST /api/company-search/export
 * Body: { companies: CompanyData[] }
 */
router.post("/export", async (req: Request, res: Response) => {
  try {
    const { companies } = req.body;

    if (!companies || !Array.isArray(companies)) {
      return res.status(400).json({ error: "Companies array is required" });
    }

    console.log(`[CompanySearch] Exporting ${companies.length} companies to CSV`);

    // Flatten companies and executives into CSV rows
    const csvRows: any[] = [];

    for (const company of companies) {
      if (company.executives && company.executives.length > 0) {
        // Create a row for each executive
        for (const exec of company.executives) {
          csvRows.push({
            'Company Name': company.businessName,
            'Industry': company.industry || '',
            'Company City': company.city || '',
            'Company State': company.state || '',
            'Company Website': company.website || '',
            'Company LinkedIn': company.linkedinUrl || '',
            'Employee Count': company.employeeCount || '',
            'Annual Revenue': company.annualRevenue || '',
            'Founded': company.founded || '',
            'Executive Name': exec.name,
            'Executive Title': exec.title,
            'Executive Email': exec.email || '',
            'Executive Phone': exec.phone || '',
            'Executive LinkedIn': exec.linkedin || '',
            'Data Confidence': company.confidence,
            'Data Sources': company.sources?.join(', ') || '',
          });
        }
      } else {
        // Company without executives
        csvRows.push({
          'Company Name': company.businessName,
          'Industry': company.industry || '',
          'Company City': company.city || '',
          'Company State': company.state || '',
          'Company Website': company.website || '',
          'Company LinkedIn': company.linkedinUrl || '',
          'Employee Count': company.employeeCount || '',
          'Annual Revenue': company.annualRevenue || '',
          'Founded': company.founded || '',
          'Executive Name': company.ownerName || '',
          'Executive Title': 'Owner/CEO',
          'Executive Email': company.email || '',
          'Executive Phone': company.phone || '',
          'Executive LinkedIn': '',
          'Data Confidence': company.confidence,
          'Data Sources': company.sources?.join(', ') || '',
        });
      }
    }

    // Convert to CSV
    const csv = Papa.unparse(csvRows);

    // Set headers for file download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `companies_export_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

    console.log(`[CompanySearch] ✅ Exported ${csvRows.length} rows to ${filename}`);
  } catch (error: any) {
    console.error("[CompanySearch] Export error:", error);
    res.status(500).json({ 
      error: "Failed to export CSV",
      message: error.message 
    });
  }
});

/**
 * Bulk enrich companies from uploaded CSV
 * POST /api/company-search/bulk-enrich
 * Upload CSV with "company_name" column
 */
router.post("/bulk-enrich", upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check if SeamlessAI is configured
    if (!seamlessAI.isConfigured()) {
      return res.status(503).json({ 
        error: "SeamlessAI API not configured",
        message: "Set SEAMLESS_API_KEY environment variable" 
      });
    }

    console.log(`[CompanySearch] Processing bulk enrichment from CSV`);

    // Parse CSV
    const csvContent = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse(csvContent, { 
      header: true, 
      skipEmptyLines: true,
      delimiter: ",",
      newline: "\n"
    });

    // Only check for critical errors
    const criticalErrors = parsed.errors.filter(e => e.type !== 'Delimiter');
    if (criticalErrors.length > 0) {
      return res.status(400).json({ 
        error: "Invalid CSV file",
        details: criticalErrors 
      });
    }

    // Extract company names (support multiple column name variations)
    const companyNames: string[] = [];
    for (const row of parsed.data as any[]) {
      const name = row['company_name'] || row['Company Name'] || row['company'] || row['Company'] || row['business_name'] || row['Business Name'];
      if (name && typeof name === 'string') {
        companyNames.push(name.trim());
      }
    }

    if (companyNames.length === 0) {
      return res.status(400).json({ 
        error: "No company names found in CSV",
        message: "CSV must have a column named 'company_name', 'Company Name', 'company', or 'Company'" 
      });
    }

    const includePhoneResearch =
      String(req.body.includePhoneResearch || req.query.includePhoneResearch || "") === "true";
    const maxCompaniesCap = Math.min(
      Number(req.body.maxCompanies || req.query.maxCompanies) || 50,
      75
    );
    const maxCompanies = Math.min(companyNames.length, maxCompaniesCap);

    let totalContactSearches = 0;
    let totalResearchRequests = 0;

    console.log(
      `[CompanySearch] Enriching ${maxCompanies} companies (includePhoneResearch=${includePhoneResearch})…`
    );

    const enrichedCompanies: any[] = [];

    for (let i = 0; i < maxCompanies; i++) {
      const name = companyNames[i];
      try {
        console.log(`[CompanySearch] ${i + 1}/${maxCompanies}: ${name}`);
        if (includePhoneResearch) {
          const { contacts, creditUsage } = await seamlessAI.researchContactsWithPhones(name, 15, {
            ownersOnly: true,
            maxResearchContacts: 3,
          });
          totalContactSearches += creditUsage.contactSearches;
          totalResearchRequests += creditUsage.researchRequests;
          const first = contacts[0];
          const companyMeta = first
            ? {
                businessName: first.company || name,
                city: first.companyCity,
                state: first.companyState,
                website: first.domain ? `https://${first.domain}` : undefined,
                linkedinUrl: first.companyLIProfileUrl,
              }
            : { businessName: name };
          enrichedCompanies.push({
            ...companyMeta,
            confidence: 95,
            sources: ["SeamlessAI", "owner-phone-research"],
            executives: contacts.map((c: any) => ({
              name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
              title: c.title || "",
              email: c.email || c.email1,
              phone: c.contactPhone1 || c.phone,
              phoneConfidence: c.contactPhone1TotalAI,
              linkedin: c.liUrl || c.linkedinUrl,
            })),
            creditUsage,
          });
        } else {
          const enriched = await seamlessAI.enrichCompany(name, undefined, {
            ownerOnly: true,
            maxSearchResults: 15,
            maxExecutives: 5,
          });
          if (enriched?.creditUsage) {
            totalContactSearches += enriched.creditUsage.contactSearches;
            totalResearchRequests += enriched.creditUsage.researchRequests;
          }
          if (enriched) enrichedCompanies.push(enriched);
        }

        if (i < maxCompanies - 1) {
          await new Promise((r) => setTimeout(r, includePhoneResearch ? 2000 : 1000));
        }
      } catch (error: any) {
        console.error(`[CompanySearch] Error enriching ${name}:`, error.message);
      }
    }

    const creditsSummary = {
      contactSearches: totalContactSearches,
      researchRequests: totalResearchRequests,
      estimatedCredits: totalContactSearches + totalResearchRequests,
      note: "Each company used 1 contact search" + (includePhoneResearch ? " plus up to 3 owner/C-level research requests." : " (owner/C-level only, no phone research)."),
    };

    console.log(`[CompanySearch] ✅ Done ${enrichedCompanies.length}/${maxCompanies} — ~${creditsSummary.estimatedCredits} est. credits`);

    res.json({
      success: true,
      total: companyNames.length,
      processed: maxCompanies,
      enriched: enrichedCompanies.length,
      companies: enrichedCompanies,
      includePhoneResearch,
      creditsSummary,
    });

  } catch (error: any) {
    console.error("[CompanySearch] Bulk enrichment error:", error);
    res.status(500).json({ 
      error: "Failed to process bulk enrichment",
      message: error.message 
    });
  }
});

/**
 * Research contacts with phone numbers for a company
 * POST /api/company-search/research-contacts
 * Body: { companyName: string, limit?: number }
 * 
 * This uses the full research flow:
 * 1. Search contacts
 * 2. Create research requests
 * 3. Poll until contacts with phone numbers are ready
 */
router.post("/research-contacts", async (req: Request, res: Response) => {
  try {
    const { companyName, limit = 10 } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ error: "Company name is required" });
    }

    // Check if SeamlessAI is configured
    if (!seamlessAI.isConfigured()) {
      return res.status(503).json({ 
        error: "SeamlessAI API not configured",
        message: "Set SEAMLESS_API_KEY environment variable to enable research" 
      });
    }

    const ownersOnly = req.body.ownersOnly !== false;
    const maxResearchContacts = Math.min(Number(req.body.maxResearchContacts) || 3, 10);
    console.log(`[CompanySearch] Researching owner/C-level contacts with phones for: ${companyName}`);

    const { contacts, creditUsage } = await seamlessAI.researchContactsWithPhones(
      companyName,
      Math.min(Number(limit) || 10, 25),
      { ownersOnly, maxResearchContacts }
    );

    if (contacts.length === 0) {
      return res.status(404).json({
        error: "No contacts found",
        message: `No owner/C-level contacts with phone research results for ${companyName}`,
        creditUsage,
      });
    }

    // Format response - extract phone numbers from research results
    const formattedContacts = contacts.map(contact => {
      // Research results have contactPhone1, contactPhone2, etc.
      // Use contactPhone1 as primary phone (highest confidence)
      const primaryPhone = contact.contactPhone1 || contact.phone || '';
      const phoneConfidence = contact.contactPhone1TotalAI || '';
      
      return {
        name: contact.name || contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        seniority: contact.seniority,
        department: contact.department,
        email: contact.email || contact.email1,
        phone: primaryPhone, // Primary phone number from research
        phoneConfidence: phoneConfidence, // Confidence score
        phone2: contact.contactPhone2, // Secondary phone
        phone3: contact.contactPhone3, // Tertiary phone
        companyPhone: contact.companyPhone1, // Company phone
        company: contact.company || contact.companyOriginal,
        companyCity: contact.companyCity,
        companyState: contact.companyState,
        domain: contact.domain || contact.website,
        linkedinUrl: contact.liUrl || contact.lIProfileUrl || contact.linkedinUrl,
        city: contact.city,
        state: contact.state,
      };
    });

    res.json({
      success: true,
      companyName,
      total: formattedContacts.length,
      contacts: formattedContacts,
      creditUsage,
    });
  } catch (error: any) {
    console.error("[CompanySearch] Research contacts error:", error);
    res.status(500).json({ 
      error: "Failed to research contacts",
      message: error.message 
    });
  }
});

/**
 * Bulk research contacts from a CSV containing phone numbers
 * POST /api/company-search/bulk-research-phones
 * Upload CSV with "phone_number" (and optionally "company_name") columns
 *
 * For each row the route:
 *   1. Extracts the company name (fallback: uses phone number as query)
 *   2. Calls researchContactsWithPhones() for that company
 *   3. Returns all enriched contacts
 */
router.post("/bulk-research-phones", upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check if SeamlessAI is configured
    if (!seamlessAI.isConfigured()) {
      return res.status(503).json({
        error: "SeamlessAI API not configured",
        message: "Set SEAMLESS_API_KEY environment variable to enable research",
      });
    }

    console.log(`[CompanySearch] Processing bulk phone research from CSV`);

    // Parse CSV
    const csvContent = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      delimiter: ",",
      newline: "\n",
    });

    const criticalErrors = parsed.errors.filter((e: any) => e.type !== 'Delimiter');
    if (criticalErrors.length > 0) {
      return res.status(400).json({ error: "Invalid CSV file", details: criticalErrors });
    }

    // Extract rows — each must have at least a phone number OR a company name
    interface PhoneRow {
      phone: string;
      companyName: string;
      originalRow: any;
    }
    const rows: PhoneRow[] = [];
    for (const row of parsed.data as any[]) {
      // Flexible header matching
      const getVal = (patterns: string[]) => {
        for (const p of patterns) {
          const key = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === p.toLowerCase().replace(/[^a-z0-9]/g, ''));
          if (key && row[key]) return row[key].toString().trim();
        }
        return '';
      };

      const phone = getVal(['phone_number', 'phonenumber', 'phone', 'ph']);
      const company = getVal(['company_name', 'companyname', 'company', 'business_name', 'businessname', 'name']);

      if (phone || company) {
        rows.push({ phone, companyName: company || phone, originalRow: row });
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({
        error: "No valid rows found in CSV",
        message: "CSV must have a 'phone_number' or 'company_name' column (or both)",
      });
    }

    // De-duplicate by company name so we don't call the API twice for the same company
    const seen = new Set<string>();
    const uniqueRows = rows.filter(r => {
      const key = r.companyName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const maxRows = Math.min(uniqueRows.length, 25); // cap at 25 companies per request
    console.log(`[CompanySearch] Researching ${maxRows} unique companies for phone contacts…`);

    const allContacts: any[] = [];

    for (let i = 0; i < maxRows; i++) {
      const { phone, companyName } = uniqueRows[i];
      try {
        console.log(`[CompanySearch] [${i + 1}/${maxRows}] Researching: ${companyName}`);
        const { contacts: raw, creditUsage: rowCredits } = await seamlessAI.researchContactsWithPhones(
          companyName,
          15,
          { ownersOnly: true, maxResearchContacts: 5 }
        );

        const formatted = raw.map((contact: any) => ({
          inputPhone: phone,
          companyNameInput: companyName,
          originalData: uniqueRows[i].originalRow, // Keep original data
          name: contact.name || contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          email: contact.email || contact.email1 || '',
          phone: contact.contactPhone1 || contact.phone || '',
          phoneConfidence: contact.contactPhone1TotalAI || '',
          phone2: contact.contactPhone2 || '',
          companyPhone: contact.companyPhone1 || '',
          company: contact.company || contact.companyOriginal || companyName,
          city: contact.city || '',
          state: contact.state || '',
          linkedinUrl: contact.liUrl || contact.lIProfileUrl || contact.linkedinUrl || '',
          _creditUsage: rowCredits,
        }));

        allContacts.push(...formatted);
      } catch (err: any) {
        console.error(`[CompanySearch] Error researching ${companyName}:`, err.message);
      }

      // Rate limiting between companies
      if (i < maxRows - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    let estCredits = 0;
    for (const c of allContacts) {
      const u = c._creditUsage;
      if (u) estCredits += u.estimatedCredits;
      delete c._creditUsage;
    }

    console.log(`[CompanySearch] ✅ Bulk phone research complete: ${allContacts.length} contacts from ${maxRows} companies`);

    res.json({
      success: true,
      totalRows: rows.length,
      processed: maxRows,
      contacts: allContacts,
      creditsSummary: {
        estimatedCredits: estCredits,
        note: "Sum of per-company: 1 search + owner/C-level research requests.",
      },
    });

  } catch (error: any) {
    console.error("[CompanySearch] Bulk phone research error:", error);
    res.status(500).json({
      error: "Failed to process bulk phone research",
      message: error.message,
    });
  }
});

/**
 * Export phone research results to CSV
 * POST /api/company-search/export-phone-research
 * Body: { contacts: FormattedContact[] }
 */
router.post("/export-phone-research", async (req: Request, res: Response) => {
  try {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "Contacts array is required" });
    }

    console.log(`[CompanySearch] Exporting ${contacts.length} phone research contacts to CSV`);

    const csvRows = contacts.map((c: any) => {
      // Merge original data with enriched data
      const base: any = {};
      if (c.originalData) {
        Object.keys(c.originalData).forEach(key => {
          base[`Original ${key}`] = c.originalData[key];
        });
      }

      return {
        ...base,
        'Enriched Name': c.name || '',
        'Enriched Title': c.title || '',
        'Enriched Email': c.email || '',
        'Primary Phone': c.phone || '',
        'Phone Confidence': c.phoneConfidence || '',
        'Phone 2': c.phone2 || '',
        'Company Phone': c.companyPhone || '',
        'Company': c.company || '',
        'City': c.city || '',
        'State': c.state || '',
        'LinkedIn': c.linkedinUrl || '',
      };
    });

    const csv = Papa.unparse(csvRows);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `phone_research_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

    console.log(`[CompanySearch] ✅ Exported ${csvRows.length} rows to ${filename}`);
  } catch (error: any) {
    console.error("[CompanySearch] Export phone research error:", error);
    res.status(500).json({
      error: "Failed to export phone research CSV",
      message: error.message,
    });
  }
});

/**
 * Get company by ID (MUST BE LAST - catches all unmatched routes)
 * GET /api/company-search/:id
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // For now, just return a not found - we can implement this later
    return res.status(404).json({ error: "Company not found by ID" });
  } catch (error: any) {
    console.error("[CompanySearch] Get company error:", error);
    res.status(500).json({ 
      error: "Failed to get company details",
      message: error.message 
    });
  }
});

export default router;
