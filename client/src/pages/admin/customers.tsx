import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function CustomersPage() {
  const { data: customers, isLoading } = useQuery({
    queryKey: ["/api/customers"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-customers">
          Customers
        </h1>
        <p className="text-muted-foreground">Manage customer accounts</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">All Customers</h2>
        </CardHeader>
        <CardContent>
          {!customers || customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No customers yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 text-sm font-medium text-muted-foreground">Username</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Email</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Role</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer: any) => (
                    <tr 
                      key={customer.id} 
                      className="border-b hover-elevate"
                      data-testid={`row-customer-${customer.id}`}
                    >
                      <td className="p-2 font-medium" data-testid={`text-username-${customer.id}`}>
                        {customer.username}
                      </td>
                      <td className="p-2 text-sm">{customer.email}</td>
                      <td className="p-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                          {customer.role}
                        </span>
                      </td>
                      <td className="p-2 text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
