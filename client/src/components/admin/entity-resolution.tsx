import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  GitMerge, Search, Filter, AlertTriangle, CheckCircle,
  Link2, Unlink, History, TrendingUp, Users, Shield,
  RefreshCw, Download, Settings, ChevronDown, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DuplicateGroup {
  id: string;
  entities: EntityMatch[];
  confidence: number;
  matchedFields: string[];
  suggestedMaster: string;
}

interface EntityMatch {
  id: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  score: number;
  createdAt: Date;
  matchPercentage: number;
}

interface MergeHistory {
  id: string;
  timestamp: Date;
  action: 'merge' | 'unmerge';
  entities: string[];
  performedBy: string;
}

export default function EntityResolution() {
  const { toast } = useToast();
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(75);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch duplicate groups
  const { data: duplicates, isLoading } = useQuery<DuplicateGroup[]>({
    queryKey: ['/api/admin/entity-resolution/duplicates', confidenceThreshold, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('threshold', confidenceThreshold.toString());
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/admin/entity-resolution/duplicates?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch duplicates');
      return response.json();
    },
  });

  // Fetch merge history
  const { data: mergeHistory } = useQuery<MergeHistory[]>({
    queryKey: ['/api/admin/entity-resolution/history'],
    queryFn: async () => {
      const response = await fetch('/api/admin/entity-resolution/history', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    },
  });

  // Fetch resolution stats
  const { data: stats } = useQuery<{ totalEntities?: number; avgMatchQuality?: number }>({
    queryKey: ['/api/admin/entity-resolution/stats'],
  });

  // Merge entities mutation
  const mergeMutation = useMutation({
    mutationFn: async ({ entityIds, masterId }: { entityIds: string[]; masterId?: string }) => {
      return apiRequest('POST', '/api/admin/entity-resolution/merge', { entityIds, masterId });
    },
    onSuccess: () => {
      toast({ title: "Entities merged successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/entity-resolution'] });
      setSelectedEntities(new Set());
      setShowMergeDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to merge entities", variant: "destructive" });
    },
  });

  // Unmerge entities mutation
  const unmergeMutation = useMutation({
    mutationFn: async (mergeId: string) => {
      return apiRequest('POST', `/api/admin/entity-resolution/unmerge/${mergeId}`);
    },
    onSuccess: () => {
      toast({ title: "Entities unmerged successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/entity-resolution'] });
    },
    onError: () => {
      toast({ title: "Failed to unmerge entities", variant: "destructive" });
    },
  });

  // Bulk resolution mutation
  const bulkResolveMutation = useMutation({
    mutationFn: async (action: 'merge_all' | 'ignore_all') => {
      const response = await apiRequest('POST', '/api/admin/entity-resolution/bulk', { 
        action,
        threshold: confidenceThreshold,
        groupIds: duplicates?.filter(g => g.confidence >= 90).map(g => g.id)
      });
      return response.json();
    },
    onSuccess: (data: any, action) => {
      toast({ 
        title: action === 'merge_all' ? "Bulk merge completed" : "Duplicates ignored",
        description: `Processed ${data.processed} groups`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/entity-resolution'] });
    },
    onError: () => {
      toast({ title: "Bulk operation failed", variant: "destructive" });
    },
  });

  const toggleGroupExpanded = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleEntitySelection = (entityId: string) => {
    const newSelection = new Set(selectedEntities);
    if (newSelection.has(entityId)) {
      newSelection.delete(entityId);
    } else {
      newSelection.add(entityId);
    }
    setSelectedEntities(newSelection);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 75) return 'text-blue-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const exportDuplicates = () => {
    const data = duplicates || [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duplicates-${Date.now()}.json`;
    a.click();
    
    toast({
      title: "Duplicates Exported",
      description: `Exported ${data.length} duplicate groups`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-entity-resolution">
            <GitMerge className="w-6 h-6" />
            Entity Resolution
          </h2>
          <p className="text-muted-foreground">Identify and resolve duplicate entities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/entity-resolution'] })}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportDuplicates}
            data-testid="button-export"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEntities || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              In database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Duplicate Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duplicates?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Above {confidenceThreshold}% confidence
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Avg Match Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avgMatchQuality ? `${stats.avgMatchQuality.toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all groups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="w-4 h-4" />
              Recent Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mergeHistory?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Merges/unmerges
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Resolution Settings</CardTitle>
          <CardDescription>Configure duplicate detection parameters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <Label>Confidence Threshold: {confidenceThreshold}%</Label>
                <Slider
                  value={[confidenceThreshold]}
                  onValueChange={(value) => setConfidenceThreshold(value[0])}
                  min={50}
                  max={100}
                  step={5}
                  className="w-full"
                  data-testid="slider-confidence"
                />
                <p className="text-xs text-muted-foreground">
                  Only show duplicate groups with confidence above this threshold
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkResolveMutation.mutate('merge_all')}
                  disabled={!duplicates || duplicates.filter(g => g.confidence >= 90).length === 0}
                  data-testid="button-merge-all"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Auto-Merge High Confidence
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkResolveMutation.mutate('ignore_all')}
                  disabled={!duplicates || duplicates.length === 0}
                  data-testid="button-ignore-all"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Ignore All
                </Button>
              </div>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search entities by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Groups */}
      <Card>
        <CardHeader>
          <CardTitle>Duplicate Groups</CardTitle>
          <CardDescription>
            Review and resolve potential duplicate entities
          </CardDescription>
        </CardHeader>
        <CardContent>
          {duplicates && duplicates.length > 0 ? (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {duplicates.map((group) => (
                  <Card key={group.id} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleGroupExpanded(group.id)}
                            data-testid={`button-expand-${group.id}`}
                          >
                            {expandedGroups.has(group.id) 
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                            }
                          </Button>
                          <div>
                            <p className="font-medium">
                              {group.entities.length} potential duplicates
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Matched on: {group.matchedFields.join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-xs", getConfidenceColor(group.confidence))}>
                            {group.confidence}% confidence
                          </Badge>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedGroup(group);
                              setSelectedEntities(new Set(group.entities.map(e => e.id)));
                              setShowMergeDialog(true);
                            }}
                            data-testid={`button-merge-group-${group.id}`}
                          >
                            <GitMerge className="w-4 h-4 mr-2" />
                            Merge
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {expandedGroups.has(group.id) && (
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                <Checkbox
                                  checked={group.entities.every(e => selectedEntities.has(e.id))}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      const newSelection = new Set(selectedEntities);
                                      group.entities.forEach(e => newSelection.add(e.id));
                                      setSelectedEntities(newSelection);
                                    } else {
                                      const newSelection = new Set(selectedEntities);
                                      group.entities.forEach(e => newSelection.delete(e.id));
                                      setSelectedEntities(newSelection);
                                    }
                                  }}
                                  data-testid={`checkbox-select-all-${group.id}`}
                                />
                              </TableHead>
                              <TableHead>Business Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Match %</TableHead>
                              <TableHead>Created</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.entities.map((entity) => (
                              <TableRow key={entity.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedEntities.has(entity.id)}
                                    onCheckedChange={() => toggleEntitySelection(entity.id)}
                                    data-testid={`checkbox-entity-${entity.id}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {entity.businessName}
                                  {group.suggestedMaster === entity.id && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      Suggested Master
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>{entity.email}</TableCell>
                                <TableCell>{entity.phone}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={getConfidenceColor(entity.matchPercentage)}>
                                    {entity.matchPercentage}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(entity.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {isLoading ? "Searching for duplicates..." : "No duplicate groups found"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merge History */}
      <Card>
        <CardHeader>
          <CardTitle>Resolution History</CardTitle>
          <CardDescription>Recent merge and unmerge actions</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entities</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergeHistory?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">
                      {new Date(item.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.action === 'merge' ? 'default' : 'secondary'}>
                        {item.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.entities.length} entities</TableCell>
                    <TableCell>{item.performedBy}</TableCell>
                    <TableCell>
                      {item.action === 'merge' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unmergeMutation.mutate(item.id)}
                          data-testid={`button-unmerge-${item.id}`}
                        >
                          <Unlink className="w-4 h-4 mr-2" />
                          Undo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) || (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No history available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Merge</DialogTitle>
            <DialogDescription>
              You are about to merge {selectedEntities.size} entities. This action can be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Merging will combine all selected entities into a single master record. 
                The most complete and recent data will be preserved.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const masterId = selectedGroup?.suggestedMaster || Array.from(selectedEntities)[0];
                  mergeMutation.mutate({
                    entityIds: Array.from(selectedEntities),
                    masterId
                  });
                }}
                disabled={mergeMutation.isPending}
                data-testid="button-confirm-merge"
              >
                <GitMerge className="w-4 h-4 mr-2" />
                Confirm Merge
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowMergeDialog(false)}
                data-testid="button-cancel-merge"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}