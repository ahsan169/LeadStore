import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Lightbulb, TrendingUp, AlertTriangle, MessageSquare } from "lucide-react";
import type { AiInsight } from "@shared/schema";

interface InsightsCardProps {
  insight: AiInsight;
}

export function InsightsCard({ insight }: InsightsCardProps) {
  const segments = Array.isArray(insight.segments) ? insight.segments : [];
  const risks = Array.isArray(insight.riskFlags) ? insight.riskFlags : [];
  const outreach = Array.isArray(insight.outreachAngles) ? insight.outreachAngles : [];

  return (
    <Card data-testid="card-insights">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">AI-Generated Insights</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Generated {new Date(insight.generatedAt).toLocaleDateString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Executive Summary */}
        {insight.executiveSummary && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <h4 className="font-semibold">Executive Summary</h4>
            </div>
            <p className="text-sm leading-relaxed">{insight.executiveSummary}</p>
          </div>
        )}

        {/* Segment Recommendations */}
        {segments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              <h4 className="font-semibold">Best Performing Segments</h4>
            </div>
            <ul className="space-y-2">
              {segments.map((segment: any, index: number) => (
                <li
                  key={index}
                  className="text-sm flex items-start gap-2"
                  data-testid={`segment-${index}`}
                >
                  <span className="text-green-600 dark:text-green-400 mt-0.5">•</span>
                  <span>{segment}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk Flags */}
        {risks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <h4 className="font-semibold">Risk Flags</h4>
            </div>
            <ul className="space-y-2">
              {risks.map((risk: any, index: number) => (
                <li
                  key={index}
                  className="text-sm flex items-start gap-2 text-yellow-700 dark:text-yellow-300"
                  data-testid={`risk-${index}`}
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Outreach Recommendations */}
        {outreach.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="font-semibold">Outreach Recommendations</h4>
            </div>
            <ul className="space-y-2">
              {outreach.map((angle: any, index: number) => (
                <li
                  key={index}
                  className="text-sm flex items-start gap-2"
                  data-testid={`outreach-${index}`}
                >
                  <span className="text-blue-600 dark:text-blue-400 mt-0.5">→</span>
                  <span>{angle}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
