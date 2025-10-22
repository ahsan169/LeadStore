import { Badge } from "@/components/ui/badge";

interface QualityScoreBadgeProps {
  score: number;
  className?: string;
}

export function QualityScoreBadge({ score, className }: QualityScoreBadgeProps) {
  const getScoreConfig = (score: number) => {
    if (score >= 90) return { label: "Excellent", className: "bg-emerald-500 text-white" };
    if (score >= 80) return { label: "Good", className: "bg-green-500 text-white" };
    if (score >= 60) return { label: "Fair", className: "bg-yellow-500 text-white" };
    return { label: "Poor", className: "bg-red-500 text-white" };
  };

  const config = getScoreConfig(score);

  return (
    <Badge className={`${config.className} ${className || ""}`} data-testid={`badge-quality-${score}`}>
      {score} - {config.label}
    </Badge>
  );
}
