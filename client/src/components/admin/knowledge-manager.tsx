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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Book, Plus, Edit2, Trash2, Save, Upload, Download,
  Search, Database, GitBranch, Shield, AlertTriangle,
  CheckCircle, Info, RefreshCw, FileJson, Copy, X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OntologyField {
  canonical: string;
  synonyms: string[];
  validator?: string;
  normalizer?: string;
  description?: string;
}

interface Funder {
  id?: string;
  name: string;
  aliases: string[];
  type: string;
  tier: string;
  patterns: string[];
  riskLevel: string;
}

interface IndustryKnowledge {
  riskProfiles: Record<string, number>;
  scoringParameters: Record<string, any>;
}

export default function KnowledgeManager() {
  const { toast } = useToast();
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedFunder, setSelectedFunder] = useState<Funder | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);
  const [isAddingFunder, setIsAddingFunder] = useState(false);
  const [testFieldMapping, setTestFieldMapping] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [editingOntology, setEditingOntology] = useState("");
  const [editingFunders, setEditingFunders] = useState("");
  const [editingIndustry, setEditingIndustry] = useState("");

  // Fetch ontology
  const { data: ontology, isLoading: isLoadingOntology } = useQuery({
    queryKey: ['/api/admin/knowledge/ontology'],
    queryFn: async () => {
      const response = await fetch('/api/admin/knowledge/ontology', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch ontology');
      const data = await response.json();
      setEditingOntology(JSON.stringify(data, null, 2));
      return data;
    },
  });

  // Fetch funders database
  const { data: funders, isLoading: isLoadingFunders } = useQuery({
    queryKey: ['/api/admin/knowledge/funders'],
    queryFn: async () => {
      const response = await fetch('/api/admin/knowledge/funders', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch funders');
      const data = await response.json();
      setEditingFunders(JSON.stringify(data, null, 2));
      return data;
    },
  });

  // Fetch industry knowledge
  const { data: industryKnowledge } = useQuery({
    queryKey: ['/api/admin/knowledge/industry'],
    queryFn: async () => {
      const response = await fetch('/api/admin/knowledge/industry', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch industry knowledge');
      const data = await response.json();
      setEditingIndustry(JSON.stringify(data, null, 2));
      return data;
    },
  });

  // Update ontology mutation
  const updateOntologyMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', '/api/admin/knowledge/ontology', data);
    },
    onSuccess: () => {
      toast({ title: "Ontology updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/knowledge/ontology'] });
    },
    onError: () => {
      toast({ title: "Failed to update ontology", variant: "destructive" });
    },
  });

  // Update funders mutation
  const updateFundersMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', '/api/admin/knowledge/funders', data);
    },
    onSuccess: () => {
      toast({ title: "Funders database updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/knowledge/funders'] });
    },
    onError: () => {
      toast({ title: "Failed to update funders", variant: "destructive" });
    },
  });

  // Test field mapping mutation
  const testMappingMutation = useMutation({
    mutationFn: async (fieldName: string) => {
      const response = await apiRequest('POST', '/api/admin/knowledge/test-mapping', { field: fieldName });
      return response.json();
    },
    onSuccess: (data: any) => {
      setTestResult(data.canonical || 'No mapping found');
    },
    onError: () => {
      setTestResult('Mapping test failed');
    },
  });

  // Export knowledge base
  const exportKnowledge = () => {
    const data = {
      ontology: ontology,
      funders: funders,
      industryKnowledge: industryKnowledge,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-base-${Date.now()}.json`;
    a.click();
    
    toast({
      title: "Knowledge Base Exported",
      description: "Complete knowledge base has been downloaded",
    });
  };

  // Import knowledge base
  const handleImportKnowledge = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.ontology) {
        await updateOntologyMutation.mutateAsync(data.ontology);
      }
      if (data.funders) {
        await updateFundersMutation.mutateAsync(data.funders);
      }
      
      toast({
        title: "Knowledge Base Imported",
        description: "Successfully imported knowledge base",
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Invalid knowledge base file",
        variant: "destructive",
      });
    }
  };

  const getRiskColor = (level: string) => {
    switch(level?.toLowerCase()) {
      case 'low': return 'text-green-600 bg-green-100';
      case 'moderate': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-knowledge-manager">
            <Book className="w-6 h-6" />
            Knowledge Base Manager
          </h2>
          <p className="text-muted-foreground">Manage ontology, funders database, and industry knowledge</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportKnowledge}
            data-testid="button-export-knowledge"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Label htmlFor="import-knowledge" className="cursor-pointer">
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </span>
            </Button>
          </Label>
          <Input
            id="import-knowledge"
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportKnowledge}
          />
        </div>
      </div>

      <Tabs defaultValue="ontology" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ontology">Field Ontology</TabsTrigger>
          <TabsTrigger value="funders">Funders Database</TabsTrigger>
          <TabsTrigger value="industry">Industry Knowledge</TabsTrigger>
        </TabsList>

        {/* Ontology Tab */}
        <TabsContent value="ontology" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Field Mapping Test</CardTitle>
              <CardDescription>Test how field names are mapped to canonical fields</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a field name to test (e.g., 'company_name', 'biz name')"
                  value={testFieldMapping}
                  onChange={(e) => setTestFieldMapping(e.target.value)}
                  data-testid="input-test-field"
                />
                <Button
                  onClick={() => testMappingMutation.mutate(testFieldMapping)}
                  disabled={!testFieldMapping || testMappingMutation.isPending}
                  data-testid="button-test-mapping"
                >
                  Test Mapping
                </Button>
              </div>
              {testResult && (
                <Alert className="mt-2">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{testFieldMapping}</strong> maps to: <strong>{testResult}</strong>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Field List */}
            <Card>
              <CardHeader>
                <CardTitle>Canonical Fields</CardTitle>
                <CardDescription>Browse and manage field mappings</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {Object.entries(ontology?.fields || {}).map(([canonical, field]: [string, any]) => (
                      <div
                        key={canonical}
                        className={cn(
                          "p-3 border rounded-lg cursor-pointer transition-colors",
                          selectedField === canonical 
                            ? "bg-primary/10 border-primary" 
                            : "hover:bg-muted"
                        )}
                        onClick={() => setSelectedField(canonical)}
                        data-testid={`card-field-${canonical}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{canonical}</p>
                            <p className="text-xs text-muted-foreground">
                              {field.synonyms?.length || 0} synonyms
                            </p>
                          </div>
                          {field.validator && (
                            <Badge variant="outline" className="text-xs">
                              Validated
                            </Badge>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Field Editor */}
            <Card>
              <CardHeader>
                <CardTitle>Ontology Editor</CardTitle>
                <CardDescription>Edit the complete ontology JSON</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="relative">
                    <Textarea
                      value={editingOntology}
                      onChange={(e) => setEditingOntology(e.target.value)}
                      className="font-mono text-sm min-h-[450px]"
                      placeholder="Ontology JSON..."
                      data-testid="textarea-ontology-editor"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        navigator.clipboard.writeText(editingOntology);
                        toast({ title: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      try {
                        const data = JSON.parse(editingOntology);
                        updateOntologyMutation.mutate(data);
                      } catch (error) {
                        toast({
                          title: "Invalid JSON",
                          description: "Please check your syntax",
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={updateOntologyMutation.isPending}
                    data-testid="button-save-ontology"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Ontology
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Funders Database Tab */}
        <TabsContent value="funders" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funders List */}
            <Card>
              <CardHeader>
                <CardTitle>Funders</CardTitle>
                <CardDescription>{funders?.funders?.length || 0} funders configured</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {funders?.funders?.map((funder: Funder, idx: number) => (
                      <div
                        key={funder.id || idx}
                        className={cn(
                          "p-3 border rounded-lg cursor-pointer transition-colors",
                          selectedFunder?.name === funder.name 
                            ? "bg-primary/10 border-primary" 
                            : "hover:bg-muted"
                        )}
                        onClick={() => setSelectedFunder(funder)}
                        data-testid={`card-funder-${funder.name}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{funder.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {funder.aliases?.length || 0} aliases • {funder.type}
                            </p>
                          </div>
                          <Badge className={cn("text-xs", getRiskColor(funder.riskLevel))}>
                            {funder.riskLevel} risk
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {funder.tier}
                          </Badge>
                          {funder.patterns && funder.patterns.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {funder.patterns.length} patterns
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Funders Editor */}
            <Card>
              <CardHeader>
                <CardTitle>Funders Database Editor</CardTitle>
                <CardDescription>Edit the complete funders database</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="relative">
                    <Textarea
                      value={editingFunders}
                      onChange={(e) => setEditingFunders(e.target.value)}
                      className="font-mono text-sm min-h-[520px]"
                      placeholder="Funders JSON..."
                      data-testid="textarea-funders-editor"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        navigator.clipboard.writeText(editingFunders);
                        toast({ title: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      try {
                        const data = JSON.parse(editingFunders);
                        updateFundersMutation.mutate(data);
                      } catch (error) {
                        toast({
                          title: "Invalid JSON",
                          description: "Please check your syntax",
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={updateFundersMutation.isPending}
                    data-testid="button-save-funders"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Funders
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Industry Knowledge Tab */}
        <TabsContent value="industry" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Profiles */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Profiles</CardTitle>
                <CardDescription>Industry-specific risk assessments</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {Object.entries(industryKnowledge?.riskProfiles || {}).map(([industry, risk]: [string, any]) => (
                      <div key={industry} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="font-medium capitalize">{industry.replace(/_/g, ' ')}</span>
                        <Badge className={cn("text-xs", getRiskColor(
                          risk > 0.7 ? 'high' : risk > 0.3 ? 'moderate' : 'low'
                        ))}>
                          Risk: {(risk * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Industry Knowledge Editor */}
            <Card>
              <CardHeader>
                <CardTitle>Industry Knowledge Editor</CardTitle>
                <CardDescription>Edit risk profiles and scoring parameters</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="relative">
                    <Textarea
                      value={editingIndustry}
                      onChange={(e) => setEditingIndustry(e.target.value)}
                      className="font-mono text-sm min-h-[450px]"
                      placeholder="Industry knowledge JSON..."
                      data-testid="textarea-industry-editor"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        navigator.clipboard.writeText(editingIndustry);
                        toast({ title: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      try {
                        const data = JSON.parse(editingIndustry);
                        apiRequest('PUT', '/api/admin/knowledge/industry', data).then(() => {
                          toast({ title: "Industry knowledge updated" });
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/knowledge/industry'] });
                        });
                      } catch (error) {
                        toast({
                          title: "Invalid JSON",
                          description: "Please check your syntax",
                          variant: "destructive"
                        });
                      }
                    }}
                    data-testid="button-save-industry"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Industry Knowledge
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}