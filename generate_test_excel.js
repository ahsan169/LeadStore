import XLSX from 'xlsx';

// Create test data
const data = [
  ["Business Name", "Owner Name", "Email", "Phone", "Industry", "Annual Revenue", "Requested Amount"],
  ["Elite Motors", "Mike Wilson", "mike@elitemotors.com", "555-7890", "Automotive", "1500000", "150000"],
  ["Fashion Plus", "Sarah Lee", "sarah@fashionplus.com", "555-2468", "Retail", "800000", "75000"],
  ["City Diner", "Tom Brown", "tom@citydiner.com", "555-1357", "Restaurant", "600000", "60000"],
  ["Quick Logistics", "Emma Davis", "emma@quicklog.com", "555-9753", "Transportation", "2500000", "300000"]
];

// Create a new workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, "Leads");

// Write the workbook to a file
XLSX.writeFile(wb, "test_leads.xlsx");
console.log("Excel file created: test_leads.xlsx");