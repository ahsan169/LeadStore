import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Package, DollarSign, Users, TrendingUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function BulkManagementPage() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState('orders');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [showApproveDialog, setShowApproveDialog] = useState(false);

  // Fetch bulk orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/admin/bulk/orders'],
  });

  // Fetch discount tiers
  const { data: discounts = [], isLoading: discountsLoading } = useQuery({
    queryKey: ['/api/bulk/discounts'],
  });

  // Fetch bulk stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/bulk/stats'],
  });

  // Approve order mutation
  const approveOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; customPrice?: number }) => {
      return apiRequest(`/api/admin/bulk/orders/${data.orderId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ customPrice: data.customPrice })
      });
    },
    onSuccess: () => {
      toast({
        title: "Order Approved",
        description: "The bulk order has been approved successfully.",
      });
      setShowApproveDialog(false);
      setSelectedOrder(null);
      setCustomPrice('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bulk/orders'] });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve order",
        variant: "destructive"
      });
    }
  });

  // Create discount tier mutation
  const createDiscountMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/bulk/discounts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Discount Tier Created",
        description: "New discount tier has been added successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bulk/discounts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create discount tier",
        variant: "destructive"
      });
    }
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 bg-hero-kingdom min-h-screen">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-serif font-bold mb-2 text-gradient-royal" data-testid="heading-bulk-management">
          Bulk Operations Management
        </h1>
        <p className="text-muted-foreground">
          Manage bulk orders, discount tiers, and custom quotes
        </p>
      </div>
      
      <div className="divider-elegant mb-6" />

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <Card className="card-kingdom">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-serif font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pendingOrders} pending
              </p>
            </CardContent>
          </Card>
          <Card className="card-kingdom">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-serif font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                From bulk orders
              </p>
            </CardContent>
          </Card>
          <Card className="card-kingdom">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-serif font-medium">Avg Order Size</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(stats.averageOrderSize)} leads
              </div>
              <p className="text-xs text-muted-foreground">
                Per bulk order
              </p>
            </CardContent>
          </Card>
          <Card className="card-kingdom">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-serif font-medium">Top Tier</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.topDiscountTier}</div>
              <p className="text-xs text-muted-foreground">
                Most popular
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="orders">Bulk Orders</TabsTrigger>
          <TabsTrigger value="discounts">Discount Tiers</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Orders</CardTitle>
              <CardDescription>
                Manage and approve bulk purchase orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No bulk orders yet
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order: any) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Order #{order.id.slice(0, 8)}</span>
                          {getStatusBadge(order.status)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {order.totalLeads} leads • {formatCurrency(order.finalPrice)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {order.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowApproveDialog(true);
                            }}
                            data-testid={`button-approve-${order.id}`}
                          >
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-view-${order.id}`}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discounts">
          <Card>
            <CardHeader>
              <CardTitle>Discount Tiers</CardTitle>
              <CardDescription>
                Configure volume discount tiers for bulk purchases
              </CardDescription>
            </CardHeader>
            <CardContent>
              {discountsLoading ? (
                <div className="text-center py-8">Loading discount tiers...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4">
                    {discounts.map((discount: any) => (
                      <div
                        key={discount.tierName}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <div className="font-semibold">{discount.tierName}</div>
                          <div className="text-sm text-muted-foreground">
                            {discount.minQuantity}
                            {discount.maxQuantity ? `-${discount.maxQuantity}` : '+'} leads
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-lg">
                          {discount.discountPercentage}% OFF
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Add New Discount Tier Form */}
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-4">Add New Discount Tier</h4>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target as HTMLFormElement);
                        createDiscountMutation.mutate({
                          tierName: formData.get('tierName'),
                          minQuantity: parseInt(formData.get('minQuantity') as string),
                          maxQuantity: formData.get('maxQuantity') ? 
                            parseInt(formData.get('maxQuantity') as string) : null,
                          discountPercentage: parseFloat(formData.get('discountPercentage') as string)
                        });
                      }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="tierName">Tier Name</Label>
                          <Input
                            id="tierName"
                            name="tierName"
                            placeholder="e.g., Mega Bundle"
                            required
                            data-testid="input-tier-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="discountPercentage">Discount %</Label>
                          <Input
                            id="discountPercentage"
                            name="discountPercentage"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="e.g., 30"
                            required
                            data-testid="input-discount-percentage"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="minQuantity">Min Quantity</Label>
                          <Input
                            id="minQuantity"
                            name="minQuantity"
                            type="number"
                            min="1"
                            placeholder="e.g., 10000"
                            required
                            data-testid="input-min-quantity"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="maxQuantity">Max Quantity (optional)</Label>
                          <Input
                            id="maxQuantity"
                            name="maxQuantity"
                            type="number"
                            min="1"
                            placeholder="Leave empty for no limit"
                            data-testid="input-max-quantity"
                          />
                        </div>
                      </div>
                      <Button 
                        type="submit"
                        disabled={createDiscountMutation.isPending}
                        data-testid="button-create-tier"
                      >
                        Create Discount Tier
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve Order Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Bulk Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Order ID:</strong> {selectedOrder.id.slice(0, 8)}
                </p>
                <p className="text-sm">
                  <strong>Quantity:</strong> {selectedOrder.totalLeads} leads
                </p>
                <p className="text-sm">
                  <strong>Original Price:</strong> {formatCurrency(selectedOrder.originalPrice)}
                </p>
                <p className="text-sm">
                  <strong>Discount Applied:</strong> {selectedOrder.discountApplied}%
                </p>
                <p className="text-sm">
                  <strong>Current Price:</strong> {formatCurrency(selectedOrder.finalPrice)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customPrice">Custom Price (optional)</Label>
                <Input
                  id="customPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter custom price if needed"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  data-testid="input-custom-price"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the calculated price
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setSelectedOrder(null);
                setCustomPrice('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedOrder) {
                  approveOrderMutation.mutate({
                    orderId: selectedOrder.id,
                    customPrice: customPrice ? parseFloat(customPrice) : undefined
                  });
                }
              }}
              disabled={approveOrderMutation.isPending}
              data-testid="button-confirm-approve"
            >
              Approve Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}