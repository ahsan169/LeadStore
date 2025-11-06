import { MCA_ENRICHMENT_CONFIG } from '../config/mca-enrichment-config';

export interface MCAScoreResult {
  mcaScore: number;
  has_bank: boolean;
  has_equipment: boolean;
  has_irs: boolean;
  has_sba: boolean;
  secured_party_count: number;
  active_filing_count: number;
  recency_score: number;
  sector: string;
  whyGoodForMCA: string;
  isGovernmentEntity: boolean;
  mcaQualityTier: 'excellent' | 'good' | 'fair' | 'poor';
  insights: string[];
}

export class MCAScoringService {
  private config = MCA_ENRICHMENT_CONFIG;

  analyzeSecuredParties(securedPartyText: string): {
    has_bank: boolean;
    has_equipment: boolean;
    has_irs: boolean;
    has_sba: boolean;
    count: number;
  } {
    const text = (securedPartyText || '').toLowerCase();
    const parties = text.split(';').filter(p => p.trim().length > 0);

    return {
      has_bank: this.containsAnyTerm(text, this.config.terms.bank),
      has_equipment: this.containsAnyTerm(text, this.config.terms.equipment),
      has_irs: this.containsAnyTerm(text, this.config.terms.irs),
      has_sba: this.containsAnyTerm(text, this.config.terms.sba),
      count: parties.length,
    };
  }

  isGovernmentEntity(businessName: string): boolean {
    const name = (businessName || '').toLowerCase();
    return this.config.exclusions.government.some(term => name.includes(term.toLowerCase()));
  }

  determineSector(businessName: string, hasEquipment: boolean): string {
    const name = (businessName || '').toLowerCase();
    
    for (const sector of this.config.sectors.highPriority) {
      if (name.includes(sector.toLowerCase())) {
        return sector.charAt(0).toUpperCase() + sector.slice(1);
      }
    }

    if (hasEquipment) {
      return 'Heavy Civil/Construction';
    }

    return 'General Contractor';
  }

  calculateRecencyScore(lastFilingDate: Date | null): number {
    if (!lastFilingDate) return 0;

    const now = new Date();
    const monthsAgo = (now.getTime() - lastFilingDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (monthsAgo <= 3) return 10;
    if (monthsAgo <= 6) return 8;
    if (monthsAgo <= 12) return 6;
    if (monthsAgo <= 24) return 4;
    if (monthsAgo <= 36) return 2;
    return 0;
  }

  calculateMCAScore(params: {
    businessName: string;
    securedPartyText: string;
    activeFilingCount: number;
    lastFilingDate: Date | null;
  }): MCAScoreResult {
    const { businessName, securedPartyText, activeFilingCount, lastFilingDate } = params;

    const partyAnalysis = this.analyzeSecuredParties(securedPartyText);
    const recencyScore = this.calculateRecencyScore(lastFilingDate);

    const weights = this.config.scoring.weights;
    const penalties = this.config.scoring.penalties;

    const securedPartyScore = Math.min(partyAnalysis.count, 10) / 10;
    const filingScore = Math.min(activeFilingCount, 10) / 10;

    let score =
      weights.bank * (partyAnalysis.has_bank ? 1 : 0) +
      weights.equipment * (partyAnalysis.has_equipment ? 1 : 0) +
      weights.secured_parties * securedPartyScore +
      weights.active_filings * filingScore +
      weights.recency * (recencyScore / 10);

    score -= penalties.irs * (partyAnalysis.has_irs ? 1 : 0);
    score -= penalties.sba * (partyAnalysis.has_sba ? 1 : 0);

    score = Math.max(0, Math.min(100, score));

    const isGovEntity = this.isGovernmentEntity(businessName);
    const sector = this.determineSector(businessName, partyAnalysis.has_equipment);
    
    const insights = this.generateInsights({
      ...partyAnalysis,
      activeFilingCount,
      recencyScore,
      score,
    });

    const qualityTier = this.determineQualityTier(score, partyAnalysis);

    const whyGoodForMCA = this.generateWhyGoodForMCA({
      ...partyAnalysis,
      activeFilingCount,
      score,
    });

    return {
      mcaScore: Math.round(score * 10) / 10,
      has_bank: partyAnalysis.has_bank,
      has_equipment: partyAnalysis.has_equipment,
      has_irs: partyAnalysis.has_irs,
      has_sba: partyAnalysis.has_sba,
      secured_party_count: partyAnalysis.count,
      active_filing_count: activeFilingCount,
      recency_score: recencyScore,
      sector,
      whyGoodForMCA,
      isGovernmentEntity: isGovEntity,
      mcaQualityTier: qualityTier,
      insights,
    };
  }

  private determineQualityTier(
    score: number,
    analysis: { has_irs: boolean; has_sba: boolean }
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    if (analysis.has_irs || analysis.has_sba) return 'poor';
    if (score >= 70) return 'excellent';
    if (score >= 50) return 'good';
    if (score >= 30) return 'fair';
    return 'poor';
  }

  private generateInsights(params: {
    has_bank: boolean;
    has_equipment: boolean;
    has_irs: boolean;
    has_sba: boolean;
    activeFilingCount: number;
    recencyScore: number;
    score: number;
  }): string[] {
    const insights: string[] = [];

    if (params.has_bank && params.has_equipment) {
      insights.push('🏆 Prime MCA Candidate - Bank relationship + Equipment financing');
    }

    if (params.has_equipment) {
      insights.push('🚜 Equipment-intensive operations (capex-heavy, frequent cash flow gaps)');
    }

    if (params.has_bank) {
      insights.push('🏦 Existing bank relationship (operating lines/term debt profile)');
    }

    if (params.activeFilingCount >= 5) {
      insights.push(`📊 Active credit user (${params.activeFilingCount} active filings)`);
    }

    if (params.recencyScore >= 8) {
      insights.push('⏰ Recent filing activity (active in last 3-6 months)');
    }

    if (params.has_irs) {
      insights.push('⚠️ IRS lien present - NOT suitable for MCA');
    }

    if (params.has_sba) {
      insights.push('⚠️ SBA lien present - NOT suitable for MCA');
    }

    if (params.score >= 70 && !params.has_irs && !params.has_sba) {
      insights.push('✅ Strong MCA fit - Ready for outreach');
    }

    if (params.score >= 50 && params.score < 70) {
      insights.push('📞 Good MCA prospect - Worth calling');
    }

    return insights;
  }

  private generateWhyGoodForMCA(params: {
    has_bank: boolean;
    has_equipment: boolean;
    activeFilingCount: number;
    count: number;
    score: number;
  }): string {
    const reasons: string[] = [];

    if (params.has_equipment) {
      reasons.push('Equipment/payroll intensive operations');
    }

    if (params.has_bank) {
      reasons.push('Existing bank relationship indicates creditworthiness');
    }

    if (params.activeFilingCount >= 3) {
      reasons.push(`${params.activeFilingCount} active filings show ongoing business activity`);
    }

    if (params.count >= 3) {
      reasons.push(`${params.count} secured parties indicate diverse credit relationships`);
    }

    if (params.score >= 70) {
      reasons.push('High MCA suitability score');
    }

    if (reasons.length === 0) {
      return 'General working capital needs';
    }

    return reasons.join('; ');
  }

  private containsAnyTerm(text: string, terms: readonly string[]): boolean {
    return terms.some(term => text.includes(term.toLowerCase()));
  }

  enrichLeadWithMCAScore(lead: {
    businessName: string;
    uccFilings?: Array<{
      securedParty: string;
      filingDate: Date;
    }>;
  }): MCAScoreResult | null {
    if (!lead.uccFilings || lead.uccFilings.length === 0) {
      return null;
    }

    if (this.isGovernmentEntity(lead.businessName)) {
      return {
        mcaScore: 0,
        has_bank: false,
        has_equipment: false,
        has_irs: false,
        has_sba: false,
        secured_party_count: 0,
        active_filing_count: 0,
        recency_score: 0,
        sector: 'Government Entity',
        whyGoodForMCA: 'Not suitable - Government/Public entity',
        isGovernmentEntity: true,
        mcaQualityTier: 'poor',
        insights: ['❌ Government/Public sector entity - NOT suitable for MCA'],
      };
    }

    const securedPartyText = lead.uccFilings
      .map(f => f.securedParty)
      .filter(Boolean)
      .join('; ');

    const lastFilingDate = lead.uccFilings.length > 0
      ? new Date(Math.max(...lead.uccFilings.map(f => new Date(f.filingDate).getTime())))
      : null;

    const result = this.calculateMCAScore({
      businessName: lead.businessName,
      securedPartyText,
      activeFilingCount: lead.uccFilings.length,
      lastFilingDate,
    });

    return result;
  }
}

export const mcaScoringService = new MCAScoringService();
