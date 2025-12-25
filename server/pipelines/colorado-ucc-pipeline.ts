import { db } from "../db";
import { leads, leadBatches, pipelineRuns } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN;
const BASE_URL = "https://data.colorado.gov/resource";

const BANK_KEYWORDS = [
  " bank", "bank,", "bank ", "national bank", "savings bank", "credit union",
  "federal credit", "trust company", ", n.a.", " n.a.", " fsb", "federal savings",
  "wells fargo", "chase", "jpmorgan", "citibank", "u.s. bank", "pnc bank",
  "fifth third", "regions bank", "truist", "huntington bank", "keybank",
  "citizens bank", "td bank", "m&t bank", "first national", "first citizens"
];

const EQUIPMENT_FINANCE_KEYWORDS = [
  "equipment finance", "equipment leasing", "caterpillar financial",
  "john deere financial", "toyota financial", "ford credit", "ford motor credit",
  "gm financial", "de lage landen", "cit group", "paccar financial",
  "daimler truck", "volvo financial", "kubota credit", "agco finance",
  "ally financial", "bmw financial", "mercedes-benz financial"
];

const KNOWN_MCA_COMPANIES = [
  "ondeck", "kabbage", "bluevine", "can capital", "rapid advance",
  "quick capital", "business backer", "credibly", "lendio", "fundbox",
  "square capital", "paypal working capital", "shopify capital",
  "amazon lending", "merchant cash", "clearco", "pipe technologies",
  "wayflyer", "capchase", "ramp", "brex", "fundthrough", "behalf",
  "liberis", "forward financing", "fora financial", "greenbox capital",
  "national funding", "balboa capital", "crestmont capital", "yellowstone capital",
  "leaf capital", "nitro advance", "lily advance", "bizfund", "bizfi",
  "newtek", "newco capital", "swift capital", "strategic funding",
  "united capital", "snap advances", "reliant funding", "cfgms"
];

interface UCCFiling {
  transactionid?: string;
  masterdocumentid?: string;
  filingdate?: string;
  filingtype?: string;
  documenttype?: string;
  continuation?: string;
  terminationflag?: string;
  fileid?: string;
}

interface DebtorRecord {
  fileid: string;
  organizationname?: string;
  address1?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

interface SecuredPartyRecord {
  fileid: string;
  organizationname?: string;
  firstname?: string;
  lastname?: string;
  address1?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

interface ProcessedLead {
  fileId: string;
  transactionId?: string;
  filingDate: Date;
  daysSinceFiling: number;
  leadScore: number;
  debtorName: string;
  debtorAddress?: string;
  debtorCity?: string;
  debtorState?: string;
  debtorZip?: string;
  securedPartyName?: string;
  spType: string;
  spAddress?: string;
  spCity?: string;
  spState?: string;
  spZip?: string;
  documentType?: string;
  filingType?: string;
}

function classifySecuredParty(name?: string): { type: string; score: number } {
  if (!name) return { type: "unknown", score: 50 };
  
  const nameLower = name.toLowerCase();
  
  for (const keyword of BANK_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      return { type: "bank", score: 90 };
    }
  }
  
  for (const keyword of EQUIPMENT_FINANCE_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      return { type: "equipment_finance", score: 85 };
    }
  }
  
  for (const keyword of KNOWN_MCA_COMPANIES) {
    if (nameLower.includes(keyword)) {
      return { type: "mca_company", score: 95 };
    }
  }
  
  return { type: "other", score: 60 };
}

function calculateLeadScore(
  spType: string,
  daysSinceFiling: number,
  hasDebtorName: boolean,
  hasDebtorAddress: boolean
): number {
  let score = 50;
  
  if (spType === "mca_company") score += 40;
  else if (spType === "bank") score += 30;
  else if (spType === "equipment_finance") score += 25;
  else if (spType === "other") score += 10;
  
  if (daysSinceFiling >= 30 && daysSinceFiling <= 120) {
    score += 20;
  } else if (daysSinceFiling > 120 && daysSinceFiling <= 180) {
    score += 10;
  } else if (daysSinceFiling < 30) {
    score -= 10;
  }
  
  if (hasDebtorName) score += 5;
  if (hasDebtorAddress) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchFilings(daysBackMin = 0, daysBackMax = 120): Promise<UCCFiling[]> {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - daysBackMin);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBackMax);
  
  const startStr = startDate.toISOString().split("T")[0] + "T00:00:00";
  const endStr = endDate.toISOString().split("T")[0] + "T23:59:59";
  
  const selectFields = [
    "transactionid", "masterdocumentid", "filingdate", "filingtype",
    "documenttype", "continuation", "terminationflag", "fileid"
  ].join(",");
  
  const whereClause = encodeURIComponent(
    `documenttype = 'UCC financing statement' ` +
    `AND continuation = false ` +
    `AND terminationflag = false ` +
    `AND filingdate >= '${startStr}' ` +
    `AND filingdate <= '${endStr}'`
  );
  
  const url = `${BASE_URL}/wffy-3uut.json?$select=${selectFields}&$where=${whereClause}&$limit=50000`;
  
  console.log(`[Colorado UCC] Fetching filings from ${startStr.slice(0, 10)} to ${endStr.slice(0, 10)}...`);
  
  const response = await fetchWithRetry(url, {
    headers: { "X-App-Token": SOCRATA_APP_TOKEN || "" }
  });
  
  const data = await response.json() as UCCFiling[];
  console.log(`[Colorado UCC] Found ${data.length} filings`);
  return data;
}

async function fetchDebtors(fileIds: string[]): Promise<Map<string, DebtorRecord>> {
  const debtorMap = new Map<string, DebtorRecord>();
  if (fileIds.length === 0) return debtorMap;
  
  const chunkSize = 800;
  for (let i = 0; i < fileIds.length; i += chunkSize) {
    const chunk = fileIds.slice(i, i + chunkSize);
    const inClause = chunk.map(id => `'${id}'`).join(",");
    
    const selectFields = "fileid,organizationname,address1,city,state,zipcode";
    const whereClause = encodeURIComponent(`fileid in (${inClause})`);
    
    const url = `${BASE_URL}/8upq-58vz.json?$select=${selectFields}&$where=${whereClause}&$limit=50000`;
    
    const response = await fetchWithRetry(url, {
      headers: { "X-App-Token": SOCRATA_APP_TOKEN || "" }
    });
    
    const data = await response.json() as DebtorRecord[];
    for (const record of data) {
      if (record.fileid) {
        debtorMap.set(record.fileid, record);
      }
    }
  }
  
  console.log(`[Colorado UCC] Found ${debtorMap.size} debtor records`);
  return debtorMap;
}

async function fetchSecuredParties(fileIds: string[]): Promise<Map<string, SecuredPartyRecord>> {
  const spMap = new Map<string, SecuredPartyRecord>();
  if (fileIds.length === 0) return spMap;
  
  const chunkSize = 800;
  for (let i = 0; i < fileIds.length; i += chunkSize) {
    const chunk = fileIds.slice(i, i + chunkSize);
    const inClause = chunk.map(id => `'${id}'`).join(",");
    
    const selectFields = "fileid,organizationname,firstname,lastname,address1,city,state,zipcode";
    const whereClause = encodeURIComponent(`fileid in (${inClause})`);
    
    const url = `${BASE_URL}/ap62-sav4.json?$select=${selectFields}&$where=${whereClause}&$limit=50000`;
    
    const response = await fetchWithRetry(url, {
      headers: { "X-App-Token": SOCRATA_APP_TOKEN || "" }
    });
    
    const data = await response.json() as SecuredPartyRecord[];
    for (const record of data) {
      if (record.fileid && !spMap.has(record.fileid)) {
        spMap.set(record.fileid, record);
      }
    }
  }
  
  console.log(`[Colorado UCC] Found ${spMap.size} secured party records`);
  return spMap;
}

export async function runColoradoUCCPipeline(): Promise<{
  success: boolean;
  leadsProcessed: number;
  leadsImported: number;
  topLeadsCount: number;
  error?: string;
}> {
  console.log("=" .repeat(60));
  console.log("[Colorado UCC] Starting Colorado UCC MCA Lead Generator");
  console.log(`[Colorado UCC] Run date: ${new Date().toISOString()}`);
  console.log("=" .repeat(60));
  
  if (!SOCRATA_APP_TOKEN) {
    return {
      success: false,
      leadsProcessed: 0,
      leadsImported: 0,
      topLeadsCount: 0,
      error: "SOCRATA_APP_TOKEN not configured"
    };
  }
  
  try {
    const filings = await fetchFilings(0, 120);
    
    if (filings.length === 0) {
      console.log("[Colorado UCC] No filings found in date range");
      return { success: true, leadsProcessed: 0, leadsImported: 0, topLeadsCount: 0 };
    }
    
    const fileIds = filings
      .map(f => f.fileid)
      .filter((id): id is string => !!id);
    
    const [debtorMap, spMap] = await Promise.all([
      fetchDebtors(fileIds),
      fetchSecuredParties(fileIds)
    ]);
    
    const processedLeads: ProcessedLead[] = [];
    const now = new Date();
    
    for (const filing of filings) {
      if (!filing.fileid) continue;
      
      const debtor = debtorMap.get(filing.fileid);
      const sp = spMap.get(filing.fileid);
      
      if (!debtor?.organizationname?.trim()) continue;
      
      const filingDate = filing.filingdate ? new Date(filing.filingdate) : now;
      const daysSinceFiling = Math.floor((now.getTime() - filingDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const spName = sp?.organizationname || 
        [sp?.firstname, sp?.lastname].filter(Boolean).join(" ").trim() || 
        undefined;
      
      const { type: spType } = classifySecuredParty(spName);
      
      const leadScore = calculateLeadScore(
        spType,
        daysSinceFiling,
        !!debtor.organizationname,
        !!debtor.address1
      );
      
      processedLeads.push({
        fileId: filing.fileid,
        transactionId: filing.transactionid,
        filingDate,
        daysSinceFiling,
        leadScore,
        debtorName: debtor.organizationname,
        debtorAddress: debtor.address1,
        debtorCity: debtor.city,
        debtorState: debtor.state || "CO",
        debtorZip: debtor.zipcode,
        securedPartyName: spName,
        spType,
        spAddress: sp?.address1,
        spCity: sp?.city,
        spState: sp?.state,
        spZip: sp?.zipcode,
        documentType: filing.documenttype,
        filingType: filing.filingtype
      });
    }
    
    processedLeads.sort((a, b) => b.leadScore - a.leadScore);
    
    console.log(`[Colorado UCC] Processed ${processedLeads.length} leads`);
    
    const topLeads = processedLeads.filter(l => l.leadScore >= 85);
    console.log(`[Colorado UCC] Top leads (score 85+): ${topLeads.length}`);
    
    let importedCount = 0;
    for (const lead of processedLeads) {
      try {
        const existing = await db.select()
          .from(leads)
          .where(eq(leads.uccNumber, lead.fileId))
          .limit(1);
        
        if (existing.length > 0) continue;
        
        await db.insert(leads).values({
          businessName: lead.debtorName,
          ownerName: lead.debtorName,
          email: `contact@${lead.debtorName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}.com`,
          phone: "",
          fullAddress: lead.debtorAddress,
          city: lead.debtorCity,
          stateCode: lead.debtorState,
          qualityScore: lead.leadScore,
          unifiedLeadScore: lead.leadScore,
          uccNumber: lead.fileId,
          filingDate: lead.filingDate,
          filingType: lead.filingType,
          securedParties: lead.securedPartyName,
          primaryLenderType: lead.spType === "mca_company" ? "mca" : 
                            lead.spType === "bank" ? "traditional" : "unknown",
          tier: lead.leadScore >= 90 ? "elite" : 
                lead.leadScore >= 80 ? "diamond" : 
                lead.leadScore >= 70 ? "platinum" : "gold",
          mcaScore: String(lead.leadScore),
          mcaQualityTier: lead.leadScore >= 85 ? "excellent" : 
                          lead.leadScore >= 70 ? "good" : 
                          lead.leadScore >= 50 ? "fair" : "poor",
          hasBank: lead.spType === "bank",
          mcaSector: "UCC Filing - Colorado",
          whyGoodForMCA: `Recent UCC filing with ${lead.spType} secured party. ${lead.daysSinceFiling} days old.`
        });
        
        importedCount++;
      } catch (err) {
        console.error(`[Colorado UCC] Error importing lead ${lead.fileId}:`, err);
      }
    }
    
    console.log(`[Colorado UCC] Imported ${importedCount} new leads to database`);
    
    const spTypeCounts: Record<string, number> = {};
    for (const lead of processedLeads) {
      spTypeCounts[lead.spType] = (spTypeCounts[lead.spType] || 0) + 1;
    }
    
    console.log("\n[Colorado UCC] Leads by Secured Party Type:");
    for (const [type, count] of Object.entries(spTypeCounts)) {
      console.log(`  ${type}: ${count}`);
    }
    
    const avgScore = processedLeads.reduce((sum, l) => sum + l.leadScore, 0) / processedLeads.length;
    console.log(`\n[Colorado UCC] Lead Score Stats:`);
    console.log(`  Average: ${avgScore.toFixed(1)}`);
    console.log(`  High (80+): ${processedLeads.filter(l => l.leadScore >= 80).length}`);
    console.log(`  Medium (50-79): ${processedLeads.filter(l => l.leadScore >= 50 && l.leadScore < 80).length}`);
    console.log(`  Low (<50): ${processedLeads.filter(l => l.leadScore < 50).length}`);
    
    console.log("\n" + "=" .repeat(60));
    console.log("[Colorado UCC] Pipeline complete!");
    
    return {
      success: true,
      leadsProcessed: processedLeads.length,
      leadsImported: importedCount,
      topLeadsCount: topLeads.length
    };
    
  } catch (error) {
    console.error("[Colorado UCC] Pipeline error:", error);
    return {
      success: false,
      leadsProcessed: 0,
      leadsImported: 0,
      topLeadsCount: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
