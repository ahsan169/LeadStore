import { Router, Request, Response } from "express";
import { runColoradoUCCPipeline } from "../pipelines/colorado-ucc-pipeline";
import { runFloridaPipeline } from "../pipelines/florida-pipeline";
import { db } from "../db";
import { leads } from "@shared/schema";
import { desc, sql } from "drizzle-orm";

const router = Router();

interface PipelineRun {
  id: string;
  pipeline: string;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  result?: {
    leadsProcessed: number;
    leadsImported: number;
    topLeadsCount: number;
    error?: string;
  };
}

const pipelineRuns: Map<string, PipelineRun> = new Map();

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

router.get("/status", async (req: Request, res: Response) => {
  try {
    const hasToken = !!process.env.SOCRATA_APP_TOKEN;
    
    const leadStats = await db
      .select({
        total: sql<number>`count(*)::int`,
        avgScore: sql<number>`avg(quality_score)::int`,
        today: sql<number>`count(*) filter (where uploaded_at > now() - interval '1 day')::int`,
        fromUCC: sql<number>`count(*) filter (where ucc_number is not null)::int`
      })
      .from(leads);
    
    const recentRuns = Array.from(pipelineRuns.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 10);
    
    res.json({
      configured: {
        colorado: hasToken,
        florida: true
      },
      stats: leadStats[0] || { total: 0, avgScore: 0, today: 0, fromUCC: 0 },
      recentRuns
    });
  } catch (error) {
    console.error("[Pipeline Routes] Error getting status:", error);
    res.status(500).json({ error: "Failed to get pipeline status" });
  }
});

router.post("/run/colorado", async (req: Request, res: Response) => {
  const runId = generateRunId();
  
  const run: PipelineRun = {
    id: runId,
    pipeline: "colorado",
    status: "running",
    startedAt: new Date()
  };
  pipelineRuns.set(runId, run);
  
  res.json({ runId, message: "Colorado UCC pipeline started" });
  
  try {
    const result = await runColoradoUCCPipeline();
    
    run.status = result.success ? "completed" : "failed";
    run.completedAt = new Date();
    run.result = result;
    pipelineRuns.set(runId, run);
    
    console.log(`[Pipeline Routes] Colorado pipeline ${runId} completed:`, result);
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date();
    run.result = {
      leadsProcessed: 0,
      leadsImported: 0,
      topLeadsCount: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
    pipelineRuns.set(runId, run);
    
    console.error(`[Pipeline Routes] Colorado pipeline ${runId} failed:`, error);
  }
});

router.post("/run/florida", async (req: Request, res: Response) => {
  const runId = generateRunId();
  
  const run: PipelineRun = {
    id: runId,
    pipeline: "florida",
    status: "running",
    startedAt: new Date()
  };
  pipelineRuns.set(runId, run);
  
  res.json({ runId, message: "Florida pipeline started" });
  
  try {
    const result = await runFloridaPipeline();
    
    run.status = result.success ? "completed" : "failed";
    run.completedAt = new Date();
    run.result = {
      leadsProcessed: result.leadsProcessed,
      leadsImported: result.leadsImported,
      topLeadsCount: result.topLeadsCount,
      error: result.error
    };
    pipelineRuns.set(runId, run);
    
    console.log(`[Pipeline Routes] Florida pipeline ${runId} completed:`, result);
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date();
    run.result = {
      leadsProcessed: 0,
      leadsImported: 0,
      topLeadsCount: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
    pipelineRuns.set(runId, run);
    
    console.error(`[Pipeline Routes] Florida pipeline ${runId} failed:`, error);
  }
});

router.post("/run/all", async (req: Request, res: Response) => {
  const runId = generateRunId();
  
  res.json({ runId, message: "All pipelines started" });
  
  console.log(`[Pipeline Routes] Starting all pipelines (${runId})`);
  
  const coloradoResult = await runColoradoUCCPipeline().catch(err => ({
    success: false,
    leadsProcessed: 0,
    leadsImported: 0,
    topLeadsCount: 0,
    error: err.message
  }));
  
  const floridaResult = await runFloridaPipeline().catch(err => ({
    success: false,
    leadsProcessed: 0,
    leadsImported: 0,
    topLeadsCount: 0,
    error: err.message
  }));
  
  const combinedRun: PipelineRun = {
    id: runId,
    pipeline: "all",
    status: coloradoResult.success || floridaResult.success ? "completed" : "failed",
    startedAt: new Date(),
    completedAt: new Date(),
    result: {
      leadsProcessed: coloradoResult.leadsProcessed + floridaResult.leadsProcessed,
      leadsImported: coloradoResult.leadsImported + floridaResult.leadsImported,
      topLeadsCount: coloradoResult.topLeadsCount + floridaResult.topLeadsCount,
      error: [coloradoResult.error, floridaResult.error].filter(Boolean).join("; ") || undefined
    }
  };
  pipelineRuns.set(runId, combinedRun);
  
  console.log(`[Pipeline Routes] All pipelines completed (${runId}):`, combinedRun.result);
});

router.get("/run/:runId", async (req: Request, res: Response) => {
  const { runId } = req.params;
  const run = pipelineRuns.get(runId);
  
  if (!run) {
    res.status(404).json({ error: "Pipeline run not found" });
    return;
  }
  
  res.json(run);
});

router.get("/runs", async (req: Request, res: Response) => {
  const runs = Array.from(pipelineRuns.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, 50);
  
  res.json(runs);
});

router.get("/leads/recent", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    
    const recentLeads = await db
      .select({
        id: leads.id,
        businessName: leads.businessName,
        stateCode: leads.stateCode,
        qualityScore: leads.qualityScore,
        tier: leads.tier,
        uccNumber: leads.uccNumber,
        filingDate: leads.filingDate,
        securedParties: leads.securedParties,
        primaryLenderType: leads.primaryLenderType,
        uploadedAt: leads.uploadedAt
      })
      .from(leads)
      .orderBy(desc(leads.uploadedAt))
      .limit(limit);
    
    res.json(recentLeads);
  } catch (error) {
    console.error("[Pipeline Routes] Error fetching recent leads:", error);
    res.status(500).json({ error: "Failed to fetch recent leads" });
  }
});

export default router;
