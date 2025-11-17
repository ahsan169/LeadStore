import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LeadDetailModal } from "@/components/LeadDetailModal";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Zap,
  Shield,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { format } from "date-fns";

// Lead type from the API
interface Lead {
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  industry?: string;
  annualRevenue?: string;
  qualityScore: number;
  mcaQualityScore: number;
  isEnriched: boolean;
  isValidated: boolean;
  enrichmentStatus: string;
  uploadedAt: string;
  lastEnrichedAt?: string;
  conversionProbability?: number;
  expectedDealSize?: number;
  estimatedRevenue?: number;
  readinessStatus: string;
}

export default function LeadManagementPage() {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [mcaScoreFilter, setMcaScoreFilter] = useState("all");
  const [enrichmentFilter, setEnrichmentFilter] = useState("all");
  const [validationFilter, setValidationFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(20);

  // Build filters object
  const filters = useMemo(() => {
    const f: any = {};
    if (scoreFilter !== "all") f.scoreRange = scoreFilter;
    if (mcaScoreFilter !== "all") f.mcaScoreRange = mcaScoreFilter;
    if (enrichmentFilter !== "all") f.enrichmentStatus = enrichmentFilter;
    if (validationFilter !== "all") f.validationStatus = validationFilter;
    return f;
  }, [scoreFilter, mcaScoreFilter, enrichmentFilter, validationFilter]);

  // Fetch leads with pagination and filters
  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "/api/leads/management",
      searchQuery,
      sorting,
      filters,
      pageIndex,
      pageSize
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: searchQuery,
        sortField: sorting[0]?.id || "uploadedAt",
        sortOrder: sorting[0]?.desc ? "desc" : "asc",
        filters: JSON.stringify(filters),
        page: String(pageIndex + 1),
        limit: String(pageSize)
      });
      
      const response = await fetch(`/api/leads/management?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json();
    }
  });

  const leads = data?.leads || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  // Bulk enrichment mutation
  const enrichMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await apiRequest("POST", "/api/leads/bulk-enrich", { leadIds });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Enrichment Started",
        description: "Selected leads are being enriched"
      });
      refetch();
      setRowSelection({});
    },
    onError: () => {
      toast({
        title: "Enrichment Failed",
        description: "Failed to enrich selected leads",
        variant: "destructive"
      });
    }
  });

  // Bulk validation mutation
  const validateMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await apiRequest("POST", "/api/leads/bulk-validate", { leadIds });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Validation Started",
        description: "Selected leads are being validated"
      });
      refetch();
      setRowSelection({});
    },
    onError: () => {
      toast({
        title: "Validation Failed",
        description: "Failed to validate selected leads",
        variant: "destructive"
      });
    }
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await fetch("/api/leads/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds })
      });
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads_export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export Complete",
        description: "Selected leads have been exported"
      });
      setRowSelection({});
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Failed to export selected leads",
        variant: "destructive"
      });
    }
  });

  // Score color helper
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50 dark:bg-green-900/20";
    if (score >= 60) return "text-blue-600 bg-blue-50 dark:bg-blue-900/20";
    if (score >= 40) return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20";
    return "text-red-600 bg-red-50 dark:bg-red-900/20";
  };

  // Readiness badge helper
  const getReadinessBadge = (status: string) => {
    switch (status) {
      case "ready":
        return <Badge variant="default" className="bg-green-600">Ready</Badge>;
      case "needs_validation":
        return <Badge variant="secondary">Needs Validation</Badge>;
      case "needs_enrichment":
        return <Badge variant="secondary">Needs Enrichment</Badge>;
      case "needs_processing":
        return <Badge variant="outline">Needs Processing</Badge>;
      default:
        return <Badge variant="outline">Not Ready</Badge>;
    }
  };

  // Column definitions
  const columns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            data-testid="checkbox-select-all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            data-testid={`checkbox-select-${row.original.id}`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "businessName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Business Name
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-medium" data-testid={`text-business-${row.original.id}`}>
            {row.original.businessName}
          </div>
        ),
      },
      {
        accessorKey: "ownerName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Owner
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
      },
      {
        accessorKey: "qualityScore",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Quality Score
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className={`font-bold ${getScoreColor(row.original.qualityScore)} px-2 py-1 rounded-md inline-block`}>
            {row.original.qualityScore}
          </div>
        ),
      },
      {
        accessorKey: "mcaQualityScore",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            MCA Score
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className={`font-bold ${getScoreColor(row.original.mcaQualityScore)} px-2 py-1 rounded-md inline-block`}>
            {row.original.mcaQualityScore}
          </div>
        ),
      },
      {
        accessorKey: "isEnriched",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Enrichment
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          row.original.isEnriched ? (
            <Badge variant="default" className="bg-yellow-600">
              <Zap className="w-3 h-3 mr-1" />
              Enriched
            </Badge>
          ) : (
            <Badge variant="outline">Not Enriched</Badge>
          )
        ),
      },
      {
        accessorKey: "isValidated",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Validation
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          row.original.isValidated ? (
            <Badge variant="default" className="bg-green-600">
              <Shield className="w-3 h-3 mr-1" />
              Validated
            </Badge>
          ) : (
            <Badge variant="outline">Not Validated</Badge>
          )
        ),
      },
      {
        accessorKey: "annualRevenue",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Annual Revenue
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.annualRevenue || "-"}
          </div>
        ),
      },
      {
        accessorKey: "uploadedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent font-medium"
          >
            Upload Date
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {format(new Date(row.original.uploadedAt), "MMM d, yyyy")}
          </div>
        ),
      },
      {
        id: "readiness",
        header: "Status",
        cell: ({ row }) => getReadinessBadge(row.original.readinessStatus),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedLead(row.original)}
            data-testid={`button-view-${row.original.id}`}
          >
            View Details
          </Button>
        ),
      }
    ],
    []
  );

  // React Table instance
  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
    manualPagination: true,
    manualSorting: true,
    pageCount: pagination.totalPages,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedIds = selectedRows.map(row => row.original.id);

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-3" data-testid="heading-lead-management">
          Lead Management
        </h1>
        <p className="text-lg text-muted-foreground">
          Manage, enrich, and validate your leads with powerful sorting and filtering
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter leads to find what you need</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by business or owner name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
              data-testid="input-search"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-quality-score">
                <SelectValue placeholder="Quality Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="80-100">Excellent (80+)</SelectItem>
                <SelectItem value="60-79">Good (60-79)</SelectItem>
                <SelectItem value="40-59">Average (40-59)</SelectItem>
                <SelectItem value="0-39">Poor (0-39)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={mcaScoreFilter} onValueChange={setMcaScoreFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-mca-score">
                <SelectValue placeholder="MCA Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MCA Scores</SelectItem>
                <SelectItem value="80-100">Excellent (80+)</SelectItem>
                <SelectItem value="60-79">Good (60-79)</SelectItem>
                <SelectItem value="40-59">Average (40-59)</SelectItem>
                <SelectItem value="0-39">Poor (0-39)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={enrichmentFilter} onValueChange={setEnrichmentFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-enrichment">
                <SelectValue placeholder="Enrichment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="enriched">Enriched</SelectItem>
                <SelectItem value="not_enriched">Not Enriched</SelectItem>
              </SelectContent>
            </Select>

            <Select value={validationFilter} onValueChange={setValidationFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-validation">
                <SelectValue placeholder="Validation Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="validated">Validated</SelectItem>
                <SelectItem value="not_validated">Not Validated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between py-4">
            <div className="text-sm font-medium">
              {selectedIds.length} lead{selectedIds.length > 1 ? 's' : ''} selected
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => enrichMutation.mutate(selectedIds)}
                disabled={enrichMutation.isPending}
                data-testid="button-bulk-enrich"
              >
                {enrichMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Enrich Selected
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => validateMutation.mutate(selectedIds)}
                disabled={validateMutation.isPending}
                data-testid="button-bulk-validate"
              >
                {validateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                Validate Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportMutation.mutate(selectedIds)}
                disabled={exportMutation.isPending}
                data-testid="button-bulk-export"
              >
                {exportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading leads...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={(e) => {
                        // Don't open modal if clicking checkbox or action buttons
                        if ((e.target as HTMLElement).closest('[role="checkbox"], button')) {
                          return;
                        }
                        setSelectedLead(row.original);
                      }}
                      data-testid={`row-lead-${row.original.id}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                      No leads found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min((pageIndex * pageSize) + 1, pagination.total)} to{" "}
          {Math.min((pageIndex + 1) * pageSize, pagination.total)} of{" "}
          {pagination.total} leads
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex(0)}
            disabled={pageIndex === 0}
            data-testid="button-page-first"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((old) => Math.max(0, old - 1))}
            disabled={pageIndex === 0}
            data-testid="button-page-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-sm">
              Page {pageIndex + 1} of {pagination.totalPages}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((old) => old + 1)}
            disabled={pageIndex >= pagination.totalPages - 1}
            data-testid="button-page-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex(pagination.totalPages - 1)}
            disabled={pageIndex >= pagination.totalPages - 1}
            data-testid="button-page-last"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  );
}