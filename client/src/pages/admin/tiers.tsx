import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, DollarSign, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProductTier } from "@shared/schema";

const tierFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tier: z.string().min(1, "Tier identifier is required").regex(/^[a-z]+$/, "Must be lowercase letters only"),
  price: z.number().int().min(0, "Price must be non-negative"),
  leadCount: z.number().int().min(0, "Lead count must be non-negative"),
  minQuality: z.number().int().min(0, "Min quality must be 0-100").max(100),
  maxQuality: z.number().int().min(0, "Max quality must be 0-100").max(100),
  features: z.string().min(1, "At least one feature is required"),
  active: z.boolean(),
  recommended: z.boolean(),
});

type TierFormValues = z.infer<typeof tierFormSchema>;

export default function TiersPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<ProductTier | null>(null);

  const { data: tiers = [], isLoading } = useQuery<ProductTier[]>({
    queryKey: ["/api/admin/tiers"],
  });

  const createTierMutation = useMutation({
    mutationFn: (data: TierFormValues) => 
      apiRequest("POST", "/api/admin/tiers", {
        ...data,
        features: data.features.split('\n').map(f => f.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tiers"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Tier created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create tier",
        variant: "destructive",
      });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TierFormValues }) =>
      apiRequest("PATCH", `/api/admin/tiers/${id}`, {
        ...data,
        features: data.features.split('\n').map(f => f.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tiers"] });
      setEditingTier(null);
      toast({
        title: "Success",
        description: "Tier updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update tier",
        variant: "destructive",
      });
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/tiers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tiers"] });
      toast({
        title: "Success",
        description: "Tier deactivated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate tier",
        variant: "destructive",
      });
    },
  });

  const form = useForm<TierFormValues>({
    resolver: zodResolver(tierFormSchema),
    defaultValues: {
      name: "",
      tier: "",
      price: 0,
      leadCount: 0,
      minQuality: 0,
      maxQuality: 100,
      features: "",
      active: true,
      recommended: false,
    },
  });

  const openCreateDialog = () => {
    form.reset({
      name: "",
      tier: "",
      price: 0,
      leadCount: 0,
      minQuality: 0,
      maxQuality: 100,
      features: "",
      active: true,
      recommended: false,
    });
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (tier: ProductTier) => {
    form.reset({
      name: tier.name,
      tier: tier.tier,
      price: tier.price,
      leadCount: tier.leadCount,
      minQuality: tier.minQuality,
      maxQuality: tier.maxQuality,
      features: tier.features.join('\n'),
      active: tier.active,
      recommended: tier.recommended,
    });
    setEditingTier(tier);
  };

  const onSubmit = (data: TierFormValues) => {
    if (editingTier) {
      updateTierMutation.mutate({ id: editingTier.id, data });
    } else {
      createTierMutation.mutate(data);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Contact Sales";
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading tiers...</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-hero-kingdom min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-serif font-bold text-gradient-royal" data-testid="heading-tiers">Pricing Tiers</h1>
            <p className="text-muted-foreground mt-1">
              Manage product tiers and pricing
            </p>
          </div>
          <Button onClick={openCreateDialog} data-testid="button-create-tier">
            <Plus className="w-4 h-4 mr-2" />
            Create Tier
          </Button>
        </div>
        
        <div className="divider-elegant" />

        <Card className="card-kingdom animate-slide-up">
          <CardHeader>
            <CardTitle className="font-serif">All Tiers</CardTitle>
            <CardDescription>
              {tiers.length} tier{tiers.length !== 1 ? 's' : ''} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Quality Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No tiers found. Create your first tier to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  tiers.map((tier) => (
                    <TableRow key={tier.id} data-testid={`row-tier-${tier.tier}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {tier.name}
                          {tier.recommended && (
                            <Badge className="badge-gold" data-testid={`badge-recommended-${tier.tier}`}>
                              Most Popular
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          {formatPrice(tier.price)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          {tier.leadCount === 0 ? 'Custom' : tier.leadCount}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tier.minQuality}-{tier.maxQuality}
                      </TableCell>
                      <TableCell>
                        <Badge className={tier.active ? "badge-emerald" : ""} variant={tier.active ? "default" : "secondary"} data-testid={`status-${tier.tier}`}>
                          {tier.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(tier)}
                            data-testid={`button-edit-${tier.tier}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteTierMutation.mutate(tier.id)}
                            disabled={deleteTierMutation.isPending}
                            data-testid={`button-delete-${tier.tier}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCreateDialogOpen || !!editingTier} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingTier(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-tier">
              {editingTier ? "Edit Tier" : "Create New Tier"}
            </DialogTitle>
            <DialogDescription>
              {editingTier ? "Update tier configuration" : "Add a new pricing tier"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Gold" {...field} data-testid="input-tier-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier Identifier</FormLabel>
                      <FormControl>
                        <Input placeholder="gold" {...field} disabled={!!editingTier} data-testid="input-tier-identifier" />
                      </FormControl>
                      <FormDescription>
                        Lowercase letters only (cannot be changed after creation)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (cents)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="50000" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-tier-price"
                        />
                      </FormControl>
                      <FormDescription>
                        Price in cents ($500 = 50000)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="leadCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Count</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="50" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-tier-lead-count"
                        />
                      </FormControl>
                      <FormDescription>
                        Number of leads per purchase (0 for custom)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minQuality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Quality Score</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="60" 
                          min={0}
                          max={100}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-tier-min-quality"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxQuality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Quality Score</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="79" 
                          min={0}
                          max={100}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-tier-max-quality"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="features"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Features</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="50 verified MCA leads&#10;Quality scores 60-79&#10;Basic deduplication"
                        rows={6}
                        {...field}
                        data-testid="input-tier-features"
                      />
                    </FormControl>
                    <FormDescription>
                      One feature per line
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-6">
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-tier-active"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Active</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recommended"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-tier-recommended"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Recommended</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingTier(null);
                  }}
                  data-testid="button-cancel-tier"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createTierMutation.isPending || updateTierMutation.isPending}
                  data-testid="button-save-tier"
                >
                  {createTierMutation.isPending || updateTierMutation.isPending ? "Saving..." : "Save Tier"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
