import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Terminal, Plus, Edit2, Trash2, Play, Save, 
  Upload, Download, History, GitBranch, AlertTriangle,
  CheckCircle, XCircle, Code, FileJson, Search,
  Filter, Copy, RefreshCw, Settings, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Rule {
  id: string;
  name: string;
  description: string;
  type: 'validation' | 'scoring' | 'transformation' | 'enrichment' | 'alert';
  precedence: number;
  priority: number;
  enabled: boolean;
  condition: any;
  actions: any[];
  tags?: string[];
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface DryRunResult {
  matched: boolean;
  transformations: any;
  scoreImpact: number;
  executionTime: number;
  explanation: string;
}

export default function RulesManager() {
  const { toast } = useToast();
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [testData, setTestData] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [showDryRun, setShowDryRun] = useState(false);
  const [editingRule, setEditingRule] = useState<string>("");

  // Fetch rules
  const { data: rules, isLoading } = useQuery<{ rules: Rule[] }>({
    queryKey: ['/api/rules', filterType, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('type', filterType);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/rules?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch rules');
      return response.json();
    },
  });

  // Create/Update rule mutation
  const saveRuleMutation = useMutation({
    mutationFn: async (rule: Partial<Rule>) => {
      const url = rule.id ? `/api/rules/${rule.id}` : '/api/rules';
      const method = rule.id ? 'PUT' : 'POST';
      
      return apiRequest(method, url, rule);
    },
    onSuccess: () => {
      toast({ title: "Rule saved successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      setSelectedRule(null);
      setIsCreating(false);
      setEditingRule("");
    },
    onError: () => {
      toast({ title: "Failed to save rule", variant: "destructive" });
    },
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return apiRequest('DELETE', `/api/rules/${ruleId}`);
    },
    onSuccess: () => {
      toast({ title: "Rule deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      setSelectedRule(null);
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  // Dry run mutation
  const dryRunMutation = useMutation({
    mutationFn: async ({ ruleIds, testData }: { ruleIds?: string[]; testData: any }) => {
      const response = await apiRequest('POST', '/api/rules/dry-run', { ruleIds, testData });
      return response.json() as Promise<DryRunResult>;
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      toast({ title: "Dry run completed" });
    },
    onError: () => {
      toast({ title: "Dry run failed", variant: "destructive" });
    },
  });

  // Export rules
  const exportRules = () => {
    const dataToExport = selectedRule ? [selectedRule] : rules?.rules || [];
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rules-${Date.now()}.json`;
    a.click();
    
    toast({
      title: "Rules Exported",
      description: `Exported ${dataToExport.length} rules`,
    });
  };

  // Import rules
  const handleImportRules = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedRules = JSON.parse(text);
      
      // Validate and import rules
      for (const rule of Array.isArray(importedRules) ? importedRules : [importedRules]) {
        await saveRuleMutation.mutateAsync(rule);
      }
      
      toast({
        title: "Rules Imported",
        description: `Successfully imported ${Array.isArray(importedRules) ? importedRules.length : 1} rules`,
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Invalid rules file format",
        variant: "destructive",
      });
    }
  };

  const getRuleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      validation: 'bg-blue-100 text-blue-800',
      scoring: 'bg-green-100 text-green-800',
      transformation: 'bg-purple-100 text-purple-800',
      enrichment: 'bg-yellow-100 text-yellow-800',
      alert: 'bg-red-100 text-red-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const createNewRule = () => {
    const newRule: Partial<Rule> = {
      name: 'New Rule',
      description: 'Description of the rule',
      type: 'validation',
      precedence: 20,
      priority: 50,
      enabled: true,
      condition: {
        field: '',
        operator: '==',
        value: ''
      },
      actions: [{
        type: 'set_field',
        field: '',
        value: ''
      }],
      tags: [],
    };
    setEditingRule(JSON.stringify(newRule, null, 2));
    setIsCreating(true);
    setSelectedRule(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-rules-manager">
            <Terminal className="w-6 h-6" />
            Rules Manager
          </h2>
          <p className="text-muted-foreground">Create and manage intelligence pipeline rules</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportRules}
            data-testid="button-export-rules"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Label htmlFor="import-rules" className="cursor-pointer">
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </span>
            </Button>
          </Label>
          <Input
            id="import-rules"
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportRules}
          />
          <Button
            onClick={createNewRule}
            data-testid="button-create-rule"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Rule
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search rules by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-rules"
                />
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48" data-testid="select-filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="validation">Validation</SelectItem>
                <SelectItem value="scoring">Scoring</SelectItem>
                <SelectItem value="transformation">Transformation</SelectItem>
                <SelectItem value="enrichment">Enrichment</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="lg:col-span-1">
          <Card className="h-[700px]">
            <CardHeader>
              <CardTitle>Rules</CardTitle>
              <CardDescription>
                {rules?.rules?.length || 0} rules configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[580px]">
                <div className="space-y-2">
                  {rules?.rules?.map((rule) => (
                    <div
                      key={rule.id}
                      className={cn(
                        "p-3 border rounded-lg cursor-pointer transition-colors",
                        selectedRule?.id === rule.id 
                          ? "bg-primary/10 border-primary" 
                          : "hover:bg-muted"
                      )}
                      onClick={() => {
                        setSelectedRule(rule);
                        setEditingRule(JSON.stringify(rule, null, 2));
                        setIsCreating(false);
                      }}
                      data-testid={`card-rule-${rule.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {rule.description}
                          </p>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(checked) => {
                            saveRuleMutation.mutate({
                              ...rule,
                              enabled: checked
                            });
                          }}
                          data-testid={`switch-rule-${rule.id}`}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge className={getRuleTypeColor(rule.type)}>
                          {rule.type}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            P{rule.precedence}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            #{rule.priority}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            v{rule.version}
                          </Badge>
                        </div>
                      </div>
                      {rule.tags && rule.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {rule.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )) || (
                    <p className="text-center text-muted-foreground py-8">
                      {isLoading ? "Loading rules..." : "No rules found"}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Rule Editor */}
        <div className="lg:col-span-2">
          {(selectedRule || isCreating) ? (
            <Card className="h-[700px]">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{isCreating ? 'Create Rule' : 'Edit Rule'}</span>
                  <div className="flex gap-2">
                    {!isCreating && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDryRun(true)}
                        data-testid="button-dry-run"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Dry Run
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          const rule = JSON.parse(editingRule);
                          saveRuleMutation.mutate(rule);
                        } catch (error) {
                          toast({
                            title: "Invalid JSON",
                            description: "Please check your rule syntax",
                            variant: "destructive"
                          });
                        }
                      }}
                      data-testid="button-save-rule"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    {!isCreating && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this rule?")) {
                            deleteRuleMutation.mutate(selectedRule!.id);
                          }
                        }}
                        data-testid="button-delete-rule"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="editor" className="h-[580px]">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="mt-4">
                    <div className="space-y-4">
                      <Alert>
                        <Code className="h-4 w-4" />
                        <AlertDescription>
                          Edit the rule JSON below. The rule will be validated before saving.
                        </AlertDescription>
                      </Alert>
                      <div className="relative">
                        <Textarea
                          value={editingRule}
                          onChange={(e) => setEditingRule(e.target.value)}
                          className="font-mono text-sm min-h-[450px]"
                          placeholder="Enter rule JSON..."
                          data-testid="textarea-rule-editor"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => {
                            navigator.clipboard.writeText(editingRule);
                            toast({ title: "Copied to clipboard" });
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-4">
                        {(() => {
                          try {
                            const rule = JSON.parse(editingRule);
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>Name</Label>
                                  <p className="font-medium">{rule.name}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Description</Label>
                                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Type</Label>
                                  <Badge className={getRuleTypeColor(rule.type)}>
                                    {rule.type}
                                  </Badge>
                                </div>
                                <div className="space-y-2">
                                  <Label>Condition</Label>
                                  <pre className="text-xs bg-muted p-3 rounded">
                                    {JSON.stringify(rule.condition, null, 2)}
                                  </pre>
                                </div>
                                <div className="space-y-2">
                                  <Label>Actions</Label>
                                  <pre className="text-xs bg-muted p-3 rounded">
                                    {JSON.stringify(rule.actions, null, 2)}
                                  </pre>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                    <Label>Precedence</Label>
                                    <p className="font-medium">{rule.precedence}</p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Priority</Label>
                                    <p className="font-medium">{rule.priority}</p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Enabled</Label>
                                    <p className="font-medium">{rule.enabled ? 'Yes' : 'No'}</p>
                                  </div>
                                </div>
                                {rule.tags && rule.tags.length > 0 && (
                                  <div className="space-y-2">
                                    <Label>Tags</Label>
                                    <div className="flex flex-wrap gap-1">
                                      {rule.tags.map((tag: string) => (
                                        <Badge key={tag} variant="secondary">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          } catch (error) {
                            return (
                              <Alert className="border-red-200">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <AlertDescription className="text-red-600">
                                  Invalid JSON format. Please check your syntax.
                                </AlertDescription>
                              </Alert>
                            );
                          }
                        })()}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        <Alert>
                          <History className="h-4 w-4" />
                          <AlertDescription>
                            Rule version history will be displayed here
                          </AlertDescription>
                        </Alert>
                        <p className="text-center text-muted-foreground py-8">
                          Version history not yet implemented
                        </p>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[700px] flex items-center justify-center">
              <CardContent>
                <div className="text-center text-muted-foreground">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a rule to edit or create a new one</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dry Run Dialog */}
      <Dialog open={showDryRun} onOpenChange={setShowDryRun}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Dry Run Test</DialogTitle>
            <DialogDescription>
              Test your rule with sample data to see how it behaves
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Test Data (JSON)</Label>
              <Textarea
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                className="font-mono text-sm min-h-[200px]"
                placeholder='{"businessName": "Example Corp", "annualRevenue": 1000000, ...}'
                data-testid="textarea-test-data"
              />
            </div>
            <Button
              onClick={() => {
                try {
                  const data = JSON.parse(testData);
                  dryRunMutation.mutate({
                    ruleIds: selectedRule ? [selectedRule.id] : undefined,
                    testData: { lead: data }
                  });
                } catch (error) {
                  toast({
                    title: "Invalid JSON",
                    description: "Please check your test data format",
                    variant: "destructive"
                  });
                }
              }}
              disabled={dryRunMutation.isPending}
              data-testid="button-run-test"
            >
              {dryRunMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Test
                </>
              )}
            </Button>

            {dryRunResult && (
              <div className="space-y-4">
                <Alert className={dryRunResult.matched ? "border-green-200" : "border-yellow-200"}>
                  <div className="flex items-center gap-2">
                    {dryRunResult.matched ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <AlertDescription>
                      Rule {dryRunResult.matched ? 'matched' : 'did not match'} • 
                      Execution time: {dryRunResult.executionTime}ms
                    </AlertDescription>
                  </div>
                </Alert>

                {dryRunResult.explanation && (
                  <div>
                    <Label>Explanation</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dryRunResult.explanation}
                    </p>
                  </div>
                )}

                {dryRunResult.transformations && (
                  <div>
                    <Label>Transformations Applied</Label>
                    <pre className="text-xs bg-muted p-3 rounded mt-1">
                      {JSON.stringify(dryRunResult.transformations, null, 2)}
                    </pre>
                  </div>
                )}

                {dryRunResult.scoreImpact !== undefined && (
                  <div>
                    <Label>Score Impact</Label>
                    <p className="text-lg font-bold mt-1">
                      {dryRunResult.scoreImpact > 0 ? '+' : ''}{dryRunResult.scoreImpact}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}