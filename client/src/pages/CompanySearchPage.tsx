import { useState, useRef } from "react";
import { Search, Building2, Mail, Phone, Globe, MapPin, Users, DollarSign, Sparkles, X, ExternalLink, Briefcase, Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EnrichedCompany {
  businessName: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  employeeCount?: number;
  annualRevenue?: number;
  description?: string;
  linkedinUrl?: string;
  founded?: string | number;
  confidence: number;
  sources: string[];
  executives?: Array<{
    name: string;
    title: string;
    email?: string;
    phone?: string;
    phoneConfidence?: string;
    phone2?: string;
    companyPhone?: string;
    linkedin?: string;
  }>;
}

export default function CompanySearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [enrichedResults, setEnrichedResults] = useState<EnrichedCompany[]>([]);
  const [singleEnrichment, setSingleEnrichment] = useState<EnrichedCompany | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<EnrichedCompany | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("search");
  const [bulkResults, setBulkResults] = useState<EnrichedCompany[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phone bulk research state
  const [phoneBulkResults, setPhoneBulkResults] = useState<any[]>([]);
  const [phoneBulkProgress, setPhoneBulkProgress] = useState<string>("");
  const [phoneBulkLoading, setPhoneBulkLoading] = useState(false);
  const phoneBulkFileInputRef = useRef<HTMLInputElement>(null);

  // Live search (finds multiple companies)
  const handleLiveSearch = async () => {
    setLoading(true);
    setError("");
    setEnrichedResults([]);
    
    try {
      const params = new URLSearchParams();
      params.append("query", searchQuery);

      const response = await fetch(`/api/company-search/live?${params}`);
      const data = await response.json();
      
      if (data.error) {
        if (data.error.includes("not configured")) {
          setError("⚠️ SeamlessAI API not configured. Please set SEAMLESS_API_KEY environment variable on the server.");
        } else {
          setError(data.error + ": " + (data.message || ""));
        }
      } else {
        setEnrichedResults(data.results || []);
        // Track search for analytics
        try {
          await fetch("/api/analytics/track-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              searchTerm: searchQuery, 
              companiesFound: data.results?.length || 0 
            }),
          });
        } catch (trackErr) {
          console.error("Failed to track search:", trackErr);
        }
      }
    } catch (err: any) {
      setError("Search failed: " + err.message);
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Enrich single company (get detailed info)
  const handleEnrichCompany = async () => {
    setLoading(true);
    setError("");
    setSingleEnrichment(null);
    
    try {
      const response = await fetch(`/api/company-search/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: searchQuery }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        if (data.error.includes("not configured")) {
          setError("⚠️ SeamlessAI API not configured. Please set SEAMLESS_API_KEY environment variable on the server.");
        } else {
          setError(data.error + ": " + (data.message || ""));
        }
      } else {
        setSingleEnrichment(data);
      }
    } catch (err: any) {
      setError("Enrichment failed: " + err.message);
      console.error("Enrichment error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Research contacts with phone numbers (NEW - uses research pipeline)
  const handleResearchContacts = async () => {
    setLoading(true);
    setError("");
    setSingleEnrichment(null);
    
    try {
      setUploadProgress("🔍 Searching contacts...");
      const response = await fetch(`/api/company-search/research-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: searchQuery, limit: 10 }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        if (data.error.includes("not configured")) {
          setError("⚠️ SeamlessAI API not configured. Please set SEAMLESS_API_KEY environment variable on the server.");
        } else {
          setError(data.error + ": " + (data.message || ""));
        }
        setUploadProgress("");
      } else if (data.success && data.contacts) {
        // Convert contacts to company enrichment format for display
        const enrichedCompany: EnrichedCompany = {
          businessName: data.companyName,
          confidence: 95,
          sources: ['SeamlessAI Research'],
          executives: data.contacts.map((contact: any) => ({
            name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            title: contact.title || 'Contact',
            email: contact.email,
            phone: contact.phone || contact.contactPhone1, // Extract phone from research results
            phoneConfidence: contact.phoneConfidence || contact.contactPhone1TotalAI,
            phone2: contact.phone2 || contact.contactPhone2,
            companyPhone: contact.companyPhone || contact.companyPhone1,
            linkedin: contact.linkedinUrl || contact.liUrl,
          })),
        };
        setSingleEnrichment(enrichedCompany);
        const contactsWithPhones = data.contacts.filter((c: any) => c.phone || c.contactPhone1).length;
        setUploadProgress(`✅ Found ${contactsWithPhones} contacts with phone numbers!`);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    } catch (err: any) {
      setError("Research failed: " + err.message);
      console.error("Research error:", err);
      setUploadProgress("");
    } finally {
      setLoading(false);
    }
  };

  // Get detailed information when clicking a company
  const handleCompanyClick = async (company: EnrichedCompany) => {
    setLoadingDetails(true);
    setSelectedCompany(null);
    
    try {
      // If the company already has executives, use it directly
      if (company.executives && company.executives.length > 0) {
        setSelectedCompany(company);
      } else {
        // Otherwise, fetch detailed info
        const response = await fetch(`/api/company-search/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: company.businessName }),
        });
        
        const data = await response.json();
        
        if (data.error) {
          setError(data.error + ": " + (data.message || ""));
        } else {
          setSelectedCompany(data);
        }
      }
    } catch (err: any) {
      setError("Failed to load details: " + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Download CSV
  const handleDownloadCSV = async (companies: EnrichedCompany[]) => {
    try {
      const response = await fetch('/api/company-search/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies }),
      });

      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `companies_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Track CSV download for analytics
      try {
        await fetch("/api/analytics/track-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (trackErr) {
        console.error("Failed to track download:", trackErr);
      }
    } catch (err: any) {
      setError("Failed to download CSV: " + err.message);
    }
  };

  // Handle CSV upload for bulk enrichment
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setUploadProgress("Uploading CSV...");
    setBulkResults([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      setUploadProgress("Enriching companies via SeamlessAI...");
      
      const response = await fetch('/api/company-search/bulk-enrich', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error + ": " + (data.message || ""));
      } else {
        setBulkResults(data.companies || []);
        setUploadProgress(`✅ Enriched ${data.enriched}/${data.processed} companies`);
        
        // Track bulk upload for analytics
        try {
          await fetch("/api/analytics/track-bulk-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
        } catch (trackErr) {
          console.error("Failed to track bulk upload:", trackErr);
        }
      }
    } catch (err: any) {
      setError("Upload failed: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle CSV upload for bulk phone research
  const handlePhoneBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhoneBulkLoading(true);
    setError("");
    setPhoneBulkProgress("📤 Uploading CSV...");
    setPhoneBulkResults([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      setPhoneBulkProgress("🔍 Researching contacts with phone numbers (this may take a minute)...");

      const response = await fetch('/api/company-search/bulk-research-phones', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        if (data.error.includes("not configured")) {
          setError("⚠️ SeamlessAI API not configured. Please set SEAMLESS_API_KEY environment variable on the server.");
        } else {
          setError(data.error + ": " + (data.message || ""));
        }
        setPhoneBulkProgress("");
      } else {
        setPhoneBulkResults(data.contacts || []);
        const withPhones = (data.contacts || []).filter((c: any) => c.phone).length;
        setPhoneBulkProgress(`✅ Found ${withPhones} contacts with phones from ${data.processed} companies`);
      }
    } catch (err: any) {
      setError("Upload failed: " + err.message);
      setPhoneBulkProgress("");
    } finally {
      setPhoneBulkLoading(false);
      if (phoneBulkFileInputRef.current) {
        phoneBulkFileInputRef.current.value = '';
      }
    }
  };

  // Download phone research results as CSV
  const handleDownloadPhoneResearchCSV = async () => {
    try {
      const response = await fetch('/api/company-search/export-phone-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: phoneBulkResults }),
      });

      if (!response.ok) throw new Error('Failed to export CSV');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phone_research_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError("Failed to download CSV: " + err.message);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const CompanyCard = ({ company, onClick }: { company: EnrichedCompany; onClick?: () => void }) => (
    <Card 
      className={`hover:shadow-lg transition-all ${onClick ? 'cursor-pointer hover:border-primary' : ''}`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {company.businessName}
            </CardTitle>
            {company.ownerName && (
              <CardDescription className="mt-1">
                Owner: {company.ownerName}
              </CardDescription>
            )}
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">
              {company.confidence}% confidence
            </Badge>
            {company.industry && (
              <Badge>{company.industry.split(',')[0]}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {company.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{company.description}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {company.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{company.email}</span>
            </div>
          )}

          {company.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{company.phone}</span>
            </div>
          )}

          {company.website && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{company.website}</span>
            </div>
          )}

          {(company.city || company.state) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{[company.city, company.state].filter(Boolean).join(", ")}</span>
            </div>
          )}

          {company.employeeCount && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{company.employeeCount}+ employees</span>
            </div>
          )}

          {company.annualRevenue && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{formatCurrency(company.annualRevenue)}</span>
            </div>
          )}
        </div>

        {onClick && (
          <div className="pt-3 border-t">
            <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); onClick(); }}>
              <Sparkles className="h-4 w-4 mr-2" />
              View Full Details & Contacts
            </Button>
          </div>
        )}

        {company.sources && company.sources.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              Data sources: {company.sources.join(", ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          Company Intelligence Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Find and enrich company data with SeamlessAI - Click any company for full details
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter company name (e.g., 'Tesla', 'Microsoft', 'Acme Corp')..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (activeTab === "search") {
                        handleLiveSearch();
                      } else {
                        handleEnrichCompany();
                      }
                    }
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="search">
                  <Search className="h-4 w-4 mr-2" />
                  Find Companies
                </TabsTrigger>
                <TabsTrigger value="enrich">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Enrich Single
                </TabsTrigger>
                <TabsTrigger value="bulk">
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="search" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Search for companies and click any result to see full contact details
                </p>
                <Button onClick={handleLiveSearch} disabled={loading || !searchQuery}>
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? "Searching..." : "Find Companies"}
                </Button>
              </TabsContent>

              <TabsContent value="enrich" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Get detailed enriched data with all contacts for a specific company
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleEnrichCompany} 
                    disabled={loading || !searchQuery}
                    variant="outline"
                    className="flex-1"
                  >
                    {loading && !uploadProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enriching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Quick Enrich
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={handleResearchContacts} 
                    disabled={loading || !searchQuery}
                    className="flex-1"
                  >
                    {loading && uploadProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {uploadProgress}
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 mr-2" />
                        Research with Phones ⭐
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 <strong>Research with Phones</strong> uses the full research pipeline to get guaranteed phone numbers (takes 30-60 seconds)
                </p>
              </TabsContent>

              <TabsContent value="bulk" className="space-y-4">
                {/* ── Section 1: Bulk Company Enrichment (LinkedIn / company names) ── */}
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold mb-2">Bulk Company Enrichment</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a CSV with company names. We'll enrich each one via SeamlessAI and return a downloadable CSV with all data.
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    CSV must have a column: <code className="bg-muted px-2 py-1 rounded">company_name</code> or <code className="bg-muted px-2 py-1 rounded">Company Name</code>
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload">
                    <Button asChild disabled={loading}>
                      <span>
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload CSV
                          </>
                        )}
                      </span>
                    </Button>
                  </label>
                  {uploadProgress && (
                    <p className="text-sm text-muted-foreground mt-3">{uploadProgress}</p>
                  )}
                </div>

                {/* ── Section 2: Bulk Phone Number Research ── */}
                <div className="border-2 border-dashed border-green-400 rounded-lg p-6 text-center bg-green-50/40 dark:bg-green-950/10">
                  <Phone className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <h3 className="font-semibold mb-1 text-green-800 dark:text-green-400">Bulk Phone Number Research ⭐</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a CSV with company names or phone numbers. We'll find contacts and verified phone numbers for each.
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    CSV should have a column like: <code className="bg-muted px-2 py-1 rounded">company_name</code> or <code className="bg-muted px-2 py-1 rounded">phone_number</code>
                  </p>
                  <input
                    ref={phoneBulkFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handlePhoneBulkUpload}
                    className="hidden"
                    id="phone-csv-upload"
                  />
                  <label htmlFor="phone-csv-upload">
                    <Button asChild disabled={phoneBulkLoading} className="bg-green-600 hover:bg-green-700 text-white">
                      <span>
                        {phoneBulkLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Researching...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload CSV with Phone Numbers
                          </>
                        )}
                      </span>
                    </Button>
                  </label>
                  {phoneBulkProgress && (
                    <p className="text-sm mt-3 font-medium text-green-700 dark:text-green-400">{phoneBulkProgress}</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="p-3 bg-red-100 text-red-800 rounded text-sm">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {/* Single Enrichment Result */}
        {singleEnrichment && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Enriched Company Data
            </h2>
            <CompanyCard company={singleEnrichment} onClick={() => handleCompanyClick(singleEnrichment)} />
          </div>
        )}

        {/* Multiple Search Results */}
        {enrichedResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Found {enrichedResults.length} Companies - Click any to see full details
              </h2>
              <Button onClick={() => handleDownloadCSV(enrichedResults)} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </div>
            <div className="space-y-4">
              {enrichedResults.map((company, idx) => (
                <CompanyCard key={idx} company={company} onClick={() => handleCompanyClick(company)} />
              ))}
            </div>
          </div>
        )}

        {/* Bulk Upload Results */}
        {bulkResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                ✅ Enriched {bulkResults.length} Companies from CSV
              </h2>
              <Button onClick={() => handleDownloadCSV(bulkResults)}>
                <Download className="h-4 w-4 mr-2" />
                Download Enriched CSV
              </Button>
            </div>
            <div className="space-y-4">
              {bulkResults.map((company, idx) => (
                <CompanyCard key={idx} company={company} onClick={() => handleCompanyClick(company)} />
              ))}
            </div>
          </div>
        )}

        {/* Phone Bulk Research Results */}
        {phoneBulkResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-600" />
                ✅ Phone Research: {phoneBulkResults.filter(c => c.phone).length} contacts with phones
              </h2>
              <Button onClick={handleDownloadPhoneResearchCSV} className="bg-green-600 hover:bg-green-700 text-white">
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </div>
            <div className="space-y-3">
              {phoneBulkResults.map((contact, idx) => (
                <Card key={idx} className="border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{contact.name || "—"}</h4>
                          {contact.title && <Badge variant="outline" className="text-xs">{contact.title}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{contact.company}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                          {contact.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-4 w-4 text-green-600" />
                              <a href={`tel:${contact.phone}`} className="font-semibold text-green-700 hover:underline">
                                {contact.phone}
                              </a>
                              {contact.phoneConfidence && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                  {contact.phoneConfidence} conf.
                                </Badge>
                              )}
                            </div>
                          )}
                          {contact.phone2 && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">Alt: {contact.phone2}</span>
                            </div>
                          )}
                          {contact.companyPhone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">Company: {contact.companyPhone}</span>
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                            </div>
                          )}
                          {(contact.city || contact.state) && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                          {contact.linkedinUrl && (
                            <div className="flex items-center gap-2 text-sm">
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                LinkedIn <ExternalLink className="h-3 w-3 inline" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      {contact.inputPhone && (
                        <div className="ml-4">
                          <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                            Input: {contact.inputPhone}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && !singleEnrichment && enrichedResults.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center">
              <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Ready to find companies</h3>
              <p className="text-muted-foreground text-sm">
                Enter any company name above and click "Find Companies" to search,
                or "Enrich Company" to get detailed data for a specific company.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Company Modal */}
      <Dialog open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              {selectedCompany?.businessName}
            </DialogTitle>
            <DialogDescription>
              Complete company information and contacts from SeamlessAI
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : selectedCompany && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                {/* Company Overview */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Overview
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedCompany.industry && (
                      <div>
                        <span className="text-muted-foreground">Industry:</span>
                        <p className="font-medium">{selectedCompany.industry}</p>
                      </div>
                    )}
                    {selectedCompany.founded && (
                      <div>
                        <span className="text-muted-foreground">Founded:</span>
                        <p className="font-medium">{selectedCompany.founded}</p>
                      </div>
                    )}
                    {(selectedCompany.city || selectedCompany.state) && (
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <p className="font-medium">{[selectedCompany.city, selectedCompany.state].filter(Boolean).join(", ")}</p>
                      </div>
                    )}
                    {selectedCompany.employeeCount && (
                      <div>
                        <span className="text-muted-foreground">Employees:</span>
                        <p className="font-medium">{selectedCompany.employeeCount}+</p>
                      </div>
                    )}
                    {selectedCompany.annualRevenue && (
                      <div>
                        <span className="text-muted-foreground">Revenue:</span>
                        <p className="font-medium">{formatCurrency(selectedCompany.annualRevenue)}</p>
                      </div>
                    )}
                    {selectedCompany.confidence && (
                      <div>
                        <span className="text-muted-foreground">Data Confidence:</span>
                        <p className="font-medium">{selectedCompany.confidence}%</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedCompany.description && (
                    <div>
                      <span className="text-muted-foreground text-sm">Description:</span>
                      <p className="text-sm mt-1">{selectedCompany.description}</p>
                    </div>
                  )}

                  {/* Links */}
                  <div className="flex gap-3 pt-2">
                    {selectedCompany.website && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedCompany.website} target="_blank" rel="noopener noreferrer">
                          <Globe className="h-4 w-4 mr-2" />
                          Website
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                    {selectedCompany.linkedinUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedCompany.linkedinUrl} target="_blank" rel="noopener noreferrer">
                          <Briefcase className="h-4 w-4 mr-2" />
                          LinkedIn
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Executives & Contacts */}
                {selectedCompany.executives && selectedCompany.executives.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Executives & Key Contacts ({selectedCompany.executives.length})
                    </h3>
                    <div className="space-y-3">
                      {selectedCompany.executives.map((exec, idx) => (
                        <Card key={idx} className="bg-muted/50">
                          <CardContent className="pt-4">
                            <div className="space-y-2">
                              <div>
                                <h4 className="font-semibold">{exec.name}</h4>
                                <p className="text-sm text-muted-foreground">{exec.title}</p>
                              </div>
                              <div className="space-y-1">
                                {exec.email && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <a href={`mailto:${exec.email}`} className="text-primary hover:underline">
                                      {exec.email}
                                    </a>
                                  </div>
                                )}
                                {(exec.phone || (exec as any).contactPhone1) && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone className="h-4 w-4 text-green-600" />
                                    <a href={`tel:${exec.phone || (exec as any).contactPhone1}`} className="hover:underline font-semibold text-green-700">
                                      {exec.phone || (exec as any).contactPhone1}
                                    </a>
                                    {(exec as any).phoneConfidence && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                        {(exec as any).phoneConfidence} confidence
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                {(exec as any).phone2 && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                                    <Phone className="h-3 w-3" />
                                    <span className="text-xs">Alt: {(exec as any).phone2}</span>
                                  </div>
                                )}
                                {(exec as any).companyPhone && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                                    <Phone className="h-3 w-3" />
                                    <span className="text-xs">Company: {(exec as any).companyPhone}</span>
                                  </div>
                                )}
                                {exec.linkedin && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                                    <a href={exec.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      LinkedIn Profile
                                      <ExternalLink className="h-3 w-3 ml-1 inline" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Sources */}
                {selectedCompany.sources && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Data sources: {selectedCompany.sources.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
