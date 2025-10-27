import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sparkles } from "lucide-react";

interface EnrichmentBadgeProps {
  isEnriched: boolean;
  className?: string;
}

export function EnrichmentBadge({ isEnriched, className }: EnrichmentBadgeProps) {
  if (!isEnriched) return null;

  return (
    <Badge 
      className={`bg-gradient-to-r from-green-500 to-emerald-500 text-white ${className || ""}`}
      data-testid="badge-enriched"
    >
      <Sparkles className="w-3 h-3 mr-1" />
      Enriched +30%
    </Badge>
  );
}

interface EnrichmentIndicatorProps {
  isEnriched: boolean;
  showPremium?: boolean;
  className?: string;
}

export function EnrichmentIndicator({ isEnriched, showPremium = false, className }: EnrichmentIndicatorProps) {
  if (!isEnriched) return null;

  return (
    <div className={`flex items-center gap-2 ${className || ""}`} data-testid="enrichment-indicator">
      <TrendingUp className="w-4 h-4 text-green-600" />
      <span className="text-sm font-medium text-green-600">
        Business Data Enriched
        {showPremium && <span className="ml-1 text-xs">(+30% Premium)</span>}
      </span>
    </div>
  );
}

interface EnrichmentDetailsProps {
  enrichmentData?: {
    socialProfiles?: {
      linkedin?: string;
      twitter?: string;
    };
    companySize?: string;
    yearFounded?: number;
    websiteUrl?: string;
    naicsCode?: string;
  };
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  companySize?: string | null;
  yearFounded?: number | null;
  naicsCode?: string | null;
  className?: string;
}

export function EnrichmentDetails({ 
  enrichmentData,
  linkedinUrl,
  websiteUrl,
  companySize,
  yearFounded,
  naicsCode,
  className 
}: EnrichmentDetailsProps) {
  const hasEnrichmentData = enrichmentData || linkedinUrl || websiteUrl || companySize || yearFounded || naicsCode;
  if (!hasEnrichmentData) return null;

  const details = [
    { label: 'LinkedIn', value: enrichmentData?.socialProfiles?.linkedin || linkedinUrl },
    { label: 'Website', value: enrichmentData?.websiteUrl || websiteUrl },
    { label: 'Company Size', value: enrichmentData?.companySize || companySize },
    { label: 'Year Founded', value: enrichmentData?.yearFounded || yearFounded },
    { label: 'NAICS Code', value: enrichmentData?.naicsCode || naicsCode },
  ].filter(item => item.value);

  if (details.length === 0) return null;

  return (
    <div className={`space-y-1 text-sm ${className || ""}`} data-testid="enrichment-details">
      <div className="flex items-center gap-1 font-medium text-green-600">
        <Sparkles className="w-4 h-4" />
        <span>Enriched Data:</span>
      </div>
      {details.map((item, index) => (
        <div key={index} className="flex gap-2 ml-5 text-muted-foreground">
          <span className="font-medium">{item.label}:</span>
          {item.label === 'LinkedIn' || item.label === 'Website' ? (
            <a 
              href={item.value as string} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              data-testid={`link-${item.label.toLowerCase()}`}
            >
              {item.value}
            </a>
          ) : (
            <span>{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}