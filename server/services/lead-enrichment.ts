import { Lead, InsertLeadEnrichment, LeadEnrichment } from "@shared/schema";
import crypto from "crypto";

// Mock data for generating realistic enrichment
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500-1000", "1000+"];
const FUNDING_STAGES = ["Seed", "Series A", "Series B", "Series C", "Series D+", "IPO", "Private"];
const TECHNOLOGIES = [
  "Salesforce", "HubSpot", "Slack", "Microsoft 365", "Google Workspace",
  "QuickBooks", "Square", "Shopify", "WordPress", "AWS", "Azure"
];

const SOCIAL_PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "youtube"];

const EXECUTIVE_TITLES = [
  "CEO", "CFO", "COO", "CTO", "CMO", "President", "Vice President",
  "Director of Operations", "Director of Sales", "Director of Marketing"
];

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "Restaurant": ["dining", "food service", "hospitality", "culinary", "QSR", "fast casual"],
  "Retail": ["e-commerce", "brick-and-mortar", "inventory", "merchandising", "POS", "supply chain"],
  "Construction": ["contracting", "building", "renovation", "infrastructure", "commercial", "residential"],
  "Healthcare": ["medical", "patient care", "HIPAA", "clinical", "pharmaceutical", "wellness"],
  "Technology": ["software", "SaaS", "hardware", "IT services", "cloud", "digital transformation"],
  "Manufacturing": ["production", "assembly", "quality control", "lean", "automation", "supply chain"],
  "Transportation": ["logistics", "freight", "delivery", "fleet management", "routing", "last-mile"],
  "Professional Services": ["consulting", "advisory", "B2B", "expertise", "solutions", "strategy"],
};

// NAICS codes by industry
const NAICS_CODES: Record<string, string> = {
  "Restaurant": "722511",
  "Retail": "445110",
  "Construction": "236220",
  "Healthcare": "621111",
  "Technology": "541511",
  "Manufacturing": "339999",
  "Transportation": "484110",
  "Professional Services": "541611",
  "Real Estate": "531210",
  "Finance": "522110",
  "Education": "611310",
  "Entertainment": "711310",
};

export class LeadEnrichmentService {
  /**
   * Generate mock enrichment data for a lead
   */
  generateMockEnrichment(lead: Lead): Partial<InsertLeadEnrichment> {
    const industry = lead.industry || "General Business";
    const businessName = lead.businessName;
    const ownerName = lead.ownerName;
    
    // Generate consistent but varied data using business name as seed
    const seed = crypto.createHash('md5').update(businessName).digest('hex');
    const seedNum = parseInt(seed.substring(0, 8), 16);
    
    // Calculate confidence score based on available data
    let confidenceScore = 50; // Base score
    if (lead.industry) confidenceScore += 10;
    if (lead.annualRevenue) confidenceScore += 10;
    if (lead.timeInBusiness) confidenceScore += 10;
    if (lead.stateCode) confidenceScore += 5;
    if (lead.creditScore) confidenceScore += 5;
    
    // Add some randomness but keep it consistent for the same lead
    confidenceScore = Math.min(95, confidenceScore + (seedNum % 10));
    
    // Generate company size based on revenue if available
    let companySize = COMPANY_SIZES[seedNum % COMPANY_SIZES.length];
    if (lead.annualRevenue) {
      const revenue = parseInt(lead.annualRevenue);
      if (revenue < 1000000) companySize = "1-10";
      else if (revenue < 5000000) companySize = "11-50";
      else if (revenue < 25000000) companySize = "51-200";
      else if (revenue < 100000000) companySize = "201-500";
      else if (revenue < 500000000) companySize = "500-1000";
      else companySize = "1000+";
    }
    
    // Generate year founded based on time in business
    let yearFounded = 2020 - (seedNum % 20);
    if (lead.timeInBusiness) {
      const yearsInBusiness = parseInt(lead.timeInBusiness);
      yearFounded = new Date().getFullYear() - yearsInBusiness;
    }
    
    // Generate social profiles
    const socialProfiles = this.generateSocialProfiles(businessName, seedNum);
    
    // Generate company details
    const companyDetails = this.generateCompanyDetails(
      businessName, 
      industry, 
      companySize, 
      yearFounded, 
      seedNum
    );
    
    // Generate industry details
    const industryDetails = this.generateIndustryDetails(industry, seedNum);
    
    // Generate additional contact info
    const contactInfo = this.generateContactInfo(ownerName, businessName, lead.email, seedNum);
    
    // Build enriched data object
    const enrichedData = {
      businessName,
      industry,
      companySize,
      yearFounded,
      naicsCode: NAICS_CODES[industry] || "999999",
      socialProfiles,
      companyDetails,
      industryDetails,
      contactInfo,
      enrichmentDate: new Date().toISOString(),
      dataCompleteness: Math.round(confidenceScore),
    };
    
    return {
      leadId: lead.id,
      enrichedData,
      enrichmentSource: "mock",
      confidenceScore: confidenceScore.toFixed(2),
      socialProfiles,
      companyDetails,
      industryDetails,
      contactInfo,
    };
  }
  
  /**
   * Generate social media profiles
   */
  private generateSocialProfiles(businessName: string, seed: number): any {
    const cleanName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const profiles: any = {};
    
    // Always generate LinkedIn
    profiles.linkedin = `https://www.linkedin.com/company/${cleanName}`;
    
    // Generate other profiles based on seed
    if (seed % 2 === 0) {
      profiles.twitter = `https://twitter.com/${cleanName}`;
    }
    if (seed % 3 === 0) {
      profiles.facebook = `https://www.facebook.com/${cleanName}`;
    }
    if (seed % 4 === 0) {
      profiles.instagram = `https://www.instagram.com/${cleanName}`;
    }
    if (seed % 5 === 0) {
      profiles.youtube = `https://www.youtube.com/c/${cleanName}`;
    }
    
    return profiles;
  }
  
  /**
   * Generate company details
   */
  private generateCompanyDetails(
    businessName: string, 
    industry: string, 
    companySize: string, 
    yearFounded: number,
    seed: number
  ): any {
    const fundingStage = FUNDING_STAGES[seed % FUNDING_STAGES.length];
    const employeeCount = this.getEmployeeCountFromSize(companySize);
    
    // Select random technologies
    const techCount = 3 + (seed % 5);
    const technologies: string[] = [];
    for (let i = 0; i < techCount; i++) {
      technologies.push(TECHNOLOGIES[(seed + i) % TECHNOLOGIES.length]);
    }
    
    return {
      description: `${businessName} is a ${industry.toLowerCase()} company founded in ${yearFounded}. ` +
                  `The company specializes in providing high-quality services and solutions in the ${industry} sector.`,
      employeeCount,
      employeeRange: companySize,
      fundingStage,
      totalFunding: fundingStage === "Seed" ? "$500K-$2M" : 
                    fundingStage === "Series A" ? "$2M-$15M" :
                    fundingStage === "Series B" ? "$15M-$50M" :
                    fundingStage === "Series C" ? "$50M-$100M" :
                    fundingStage === "Series D+" ? "$100M+" : "N/A",
      technologies,
      certifications: this.generateCertifications(industry, seed),
      yearEstablished: yearFounded,
      headquarters: `United States`,
      businessModel: seed % 2 === 0 ? "B2B" : "B2C",
    };
  }
  
  /**
   * Generate industry-specific details
   */
  private generateIndustryDetails(industry: string, seed: number): any {
    const keywords = INDUSTRY_KEYWORDS[industry] || ["business", "services", "solutions"];
    const naicsCode = NAICS_CODES[industry] || "999999";
    
    // Generate sub-verticals
    const verticals: string[] = [];
    const verticalCount = 2 + (seed % 3);
    for (let i = 0; i < verticalCount; i++) {
      verticals.push(keywords[(seed + i) % keywords.length]);
    }
    
    return {
      primaryIndustry: industry,
      naicsCode,
      sicCode: String(parseInt(naicsCode) % 10000).padStart(4, '0'),
      verticals,
      keywords,
      competitiveAdvantages: [
        "Established market presence",
        "Strong customer relationships",
        "Operational excellence",
        "Innovation focus"
      ].slice(0, 2 + (seed % 3)),
      marketPosition: seed % 3 === 0 ? "Leader" : seed % 3 === 1 ? "Challenger" : "Niche Player",
    };
  }
  
  /**
   * Generate additional contact information
   */
  private generateContactInfo(ownerName: string, businessName: string, email: string, seed: number): any {
    const domain = email.split('@')[1] || 'example.com';
    const executiveCount = 2 + (seed % 3);
    const executives: any[] = [];
    
    // Add the owner as the first executive
    executives.push({
      name: ownerName,
      title: EXECUTIVE_TITLES[0],
      email: email,
      isPrimary: true,
    });
    
    // Generate additional executives
    for (let i = 1; i < executiveCount; i++) {
      const firstName = ["John", "Jane", "Michael", "Sarah", "Robert", "Lisa"][(seed + i) % 6];
      const lastName = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Davis"][(seed + i) % 6];
      executives.push({
        name: `${firstName} ${lastName}`,
        title: EXECUTIVE_TITLES[i % EXECUTIVE_TITLES.length],
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
        isPrimary: false,
      });
    }
    
    return {
      domain,
      website: `https://www.${domain}`,
      executives,
      additionalEmails: executives.slice(1).map(e => e.email),
      phoneNumbers: [
        { type: "Main", number: "Generated from lead phone" },
        { type: "Sales", number: "Extension 101" },
      ],
    };
  }
  
  /**
   * Generate certifications based on industry
   */
  private generateCertifications(industry: string, seed: number): string[] {
    const certsByIndustry: Record<string, string[]> = {
      "Restaurant": ["ServSafe", "HACCP", "Food Handler's License"],
      "Healthcare": ["HIPAA Compliant", "JCAHO Accredited", "Medicare Certified"],
      "Construction": ["OSHA Certified", "LEED Certified", "Licensed & Bonded"],
      "Technology": ["ISO 27001", "SOC 2 Type II", "PCI DSS Compliant"],
      "Manufacturing": ["ISO 9001", "Six Sigma", "Lean Manufacturing"],
      "Transportation": ["DOT Certified", "TSA Approved", "FMCSA Compliant"],
    };
    
    const certs = certsByIndustry[industry] || ["ISO 9001", "Industry Certified"];
    return certs.slice(0, 1 + (seed % certs.length));
  }
  
  /**
   * Get employee count from company size range
   */
  private getEmployeeCountFromSize(size: string): number {
    switch(size) {
      case "1-10": return 5;
      case "11-50": return 30;
      case "51-200": return 125;
      case "201-500": return 350;
      case "500-1000": return 750;
      case "1000+": return 2000;
      default: return 50;
    }
  }
  
  /**
   * Batch enrich multiple leads
   */
  async enrichBatch(leads: Lead[]): Promise<Partial<InsertLeadEnrichment>[]> {
    return leads.map(lead => this.generateMockEnrichment(lead));
  }
  
  /**
   * Calculate enrichment statistics
   */
  calculateEnrichmentStats(enrichments: LeadEnrichment[]): {
    totalEnriched: number;
    averageConfidence: number;
    sourceBreakdown: Record<string, number>;
    completenessScore: number;
  } {
    if (enrichments.length === 0) {
      return {
        totalEnriched: 0,
        averageConfidence: 0,
        sourceBreakdown: {},
        completenessScore: 0,
      };
    }
    
    const totalConfidence = enrichments.reduce((sum, e) => {
      return sum + parseFloat(e.confidenceScore as string);
    }, 0);
    
    const sourceBreakdown = enrichments.reduce((acc, e) => {
      acc[e.enrichmentSource] = (acc[e.enrichmentSource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Calculate completeness based on how many fields are populated
    const completenessScore = enrichments.reduce((sum, e) => {
      let score = 0;
      if (e.socialProfiles) score += 20;
      if (e.companyDetails) score += 30;
      if (e.industryDetails) score += 25;
      if (e.contactInfo) score += 25;
      return sum + score;
    }, 0) / enrichments.length;
    
    return {
      totalEnriched: enrichments.length,
      averageConfidence: totalConfidence / enrichments.length,
      sourceBreakdown,
      completenessScore,
    };
  }
}

// Export singleton instance
export const leadEnrichmentService = new LeadEnrichmentService();