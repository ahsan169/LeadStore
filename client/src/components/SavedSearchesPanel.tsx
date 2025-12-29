import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Bell, BellOff, Plus, Trash2, Eye, Edit } from "lucide-react";

interface SearchCriteria {
  industry?: string;
  stateCode?: string;
  minRevenue?: number;
  maxRevenue?: number;
  minRequestedAmount?: number;
  maxRequestedAmount?: number;
  creditScore?: string;
  minUnifiedScore?: number;
  minVerificationScore?: number;
  maxUccRiskLevel?: string;
}

interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  searchCriteria: SearchCriteria;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notificationFrequency: string;
  matchCount: number;
  newMatchCount: number;
  lastMatchedAt?: string;
  createdAt: string;
}

export function SavedSearchesPanel() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    searchCriteria: {} as SearchCriteria,
    emailNotifications: true,
    inAppNotifications: true,
    notificationFrequency: "daily"
  });

  // Fetch saved searches
  const { data: savedSearches = [], isLoading } = useQuery<SavedSearch[]>({
    queryKey: ["/api/saved-searches"],
  });

  // Fetch notification summary
  const { data: notifications } = useQuery<{ totalNewMatches: number }>({
    queryKey: ["/api/saved-searches/notifications"],
    refetchInterval: 60000, // Refresh every minute
  });

  // Create saved search
  const createSearchMutation = useMutation({
    mutationFn: (data: typeof formData) => 
      apiRequest("/api/saved-searches", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Saved search created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ 
        title: "Failed to create saved search", 
        variant: "destructive" 
      });
    }
  });

  // Update saved search
  const updateSearchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) => 
      apiRequest(`/api/saved-searches/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Saved search updated successfully" });
      setEditingSearch(null);
      resetForm();
    },
    onError: () => {
      toast({ 
        title: "Failed to update saved search", 
        variant: "destructive" 
      });
    }
  });

  // Delete saved search
  const deleteSearchMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest(`/api/saved-searches/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Saved search deleted successfully" });
    },
    onError: () => {
      toast({ 
        title: "Failed to delete saved search", 
        variant: "destructive" 
      });
    }
  });

  // Mark matches as read
  const markAsReadMutation = useMutation({
    mutationFn: (searchId: string) => 
      apiRequest(`/api/saved-searches/${searchId}/mark-read`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches/notifications"] });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      searchCriteria: {},
      emailNotifications: true,
      inAppNotifications: true,
      notificationFrequency: "daily"
    });
  };

  const handleEdit = (search: SavedSearch) => {
    setEditingSearch(search);
    setFormData({
      name: search.name,
      description: search.description || "",
      searchCriteria: search.searchCriteria,
      emailNotifications: search.emailNotifications,
      inAppNotifications: search.inAppNotifications,
      notificationFrequency: search.notificationFrequency
    });
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingSearch) {
      updateSearchMutation.mutate({ 
        id: editingSearch.id, 
        data: formData 
      });
    } else {
      createSearchMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <div>Loading saved searches...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with notifications */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Saved Searches</h2>
          <p className="text-muted-foreground">
            Get notified when new leads match your criteria
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {notifications && notifications.totalNewMatches > 0 && (
            <Badge className="bg-red-100 text-red-700">
              {notifications.totalNewMatches} new matches
            </Badge>
          )}
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingSearch(null); resetForm(); }}>
                <Plus className="w-4 h-4 mr-2" />
                New Search
              </Button>
            </DialogTrigger>
            
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingSearch ? "Edit Saved Search" : "Create Saved Search"}
                </DialogTitle>
                <DialogDescription>
                  Define your search criteria and notification preferences
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Basic Info */}
                <div className="space-y-2">
                  <Label htmlFor="name">Search Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., High-value California leads"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of what you're looking for"
                  />
                </div>

                {/* Search Criteria */}
                <div className="space-y-2">
                  <Label>Search Criteria</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="industry" className="text-sm">Industry</Label>
                      <Input
                        id="industry"
                        value={formData.searchCriteria.industry || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, industry: e.target.value }
                        })}
                        placeholder="e.g., Restaurant"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="state" className="text-sm">State</Label>
                      <Input
                        id="state"
                        value={formData.searchCriteria.stateCode || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, stateCode: e.target.value }
                        })}
                        placeholder="e.g., CA"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="minRevenue" className="text-sm">Min Revenue</Label>
                      <Input
                        id="minRevenue"
                        type="number"
                        value={formData.searchCriteria.minRevenue || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, minRevenue: Number(e.target.value) }
                        })}
                        placeholder="e.g., 1000000"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="minScore" className="text-sm">Min Lead Score</Label>
                      <Input
                        id="minScore"
                        type="number"
                        value={formData.searchCriteria.minUnifiedScore || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, minUnifiedScore: Number(e.target.value) }
                        })}
                        placeholder="0-100"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="minVerification" className="text-sm">Min Verification</Label>
                      <Input
                        id="minVerification"
                        type="number"
                        value={formData.searchCriteria.minVerificationScore || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, minVerificationScore: Number(e.target.value) }
                        })}
                        placeholder="0-100"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="uccRisk" className="text-sm">Max UCC Risk</Label>
                      <Select
                        value={formData.searchCriteria.maxUccRiskLevel || ""}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          searchCriteria: { ...formData.searchCriteria, maxUccRiskLevel: value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select risk level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Notification Preferences */}
                <div className="space-y-3">
                  <Label>Notification Preferences</Label>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="email-notif" className="text-sm">Email Notifications</Label>
                    <Switch
                      id="email-notif"
                      checked={formData.emailNotifications}
                      onCheckedChange={(checked) => setFormData({ ...formData, emailNotifications: checked })}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="app-notif" className="text-sm">In-App Notifications</Label>
                    <Switch
                      id="app-notif"
                      checked={formData.inAppNotifications}
                      onCheckedChange={(checked) => setFormData({ ...formData, inAppNotifications: checked })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="frequency" className="text-sm">Notification Frequency</Label>
                    <Select
                      value={formData.notificationFrequency}
                      onValueChange={(value) => setFormData({ ...formData, notificationFrequency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="daily">Daily Summary</SelectItem>
                        <SelectItem value="weekly">Weekly Summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingSearch(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit}>
                    {editingSearch ? "Update Search" : "Create Search"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Saved Searches List */}
      <div className="grid gap-4">
        {savedSearches.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No saved searches yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first saved search to get notified about matching leads
              </p>
            </CardContent>
          </Card>
        ) : (
          savedSearches.map((search: SavedSearch) => (
            <Card key={search.id} className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{search.name}</CardTitle>
                    {search.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {search.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {search.newMatchCount > 0 && (
                      <Badge className="bg-red-100 text-red-700">
                        {search.newMatchCount} new
                      </Badge>
                    )}
                    
                    <Badge variant="outline">
                      {search.matchCount} total matches
                    </Badge>
                    
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(search)}
                        data-testid={`button-edit-search-${search.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSearchMutation.mutate(search.id)}
                        data-testid={`button-delete-search-${search.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  {/* Display criteria */}
                  <div className="flex flex-wrap gap-2">
                    {search.searchCriteria.industry && (
                      <Badge variant="secondary">
                        Industry: {search.searchCriteria.industry}
                      </Badge>
                    )}
                    {search.searchCriteria.stateCode && (
                      <Badge variant="secondary">
                        State: {search.searchCriteria.stateCode}
                      </Badge>
                    )}
                    {search.searchCriteria.minRevenue && (
                      <Badge variant="secondary">
                        Min Revenue: ${(search.searchCriteria.minRevenue / 1000000).toFixed(1)}M
                      </Badge>
                    )}
                    {search.searchCriteria.minUnifiedScore && (
                      <Badge variant="secondary">
                        Min Score: {search.searchCriteria.minUnifiedScore}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Notification status */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      {search.emailNotifications || search.inAppNotifications ? (
                        <Bell className="w-4 h-4 text-green-600" />
                      ) : (
                        <BellOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span>
                        {search.notificationFrequency === 'instant' ? 'Instant' : 
                         search.notificationFrequency === 'daily' ? 'Daily' : 'Weekly'} notifications
                      </span>
                    </div>
                    
                    {search.lastMatchedAt && (
                      <span className="text-muted-foreground">
                        Last match: {new Date(search.lastMatchedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        markAsReadMutation.mutate(search.id);
                        // Navigate to matches view
                        window.location.href = `/saved-searches/${search.id}/matches`;
                      }}
                      data-testid={`button-view-matches-${search.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Matches {search.newMatchCount > 0 && `(${search.newMatchCount} new)`}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}