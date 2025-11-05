#!/usr/bin/env python3
"""
Apple Numbers File Parser
Converts Apple Numbers (.numbers) files to CSV or JSON format
"""

import sys
import json
import csv
import io
import tempfile
import shutil
from pathlib import Path

try:
    from numbers_parser import Document
except ImportError:
    print(json.dumps({"error": "numbers-parser library not installed"}))
    sys.exit(1)


def parse_numbers_file(file_path, output_format='json'):
    """
    Parse an Apple Numbers file and return the data
    
    Args:
        file_path: Path to the Numbers file
        output_format: 'json' or 'csv'
    
    Returns:
        Dictionary with parsed data or error
    """
    try:
        # Ensure file has .numbers extension for the parser
        temp_file = None
        if not file_path.endswith('.numbers'):
            # Create temporary file with .numbers extension
            temp_file = tempfile.NamedTemporaryFile(suffix='.numbers', delete=False)
            shutil.copy2(file_path, temp_file.name)
            file_path = temp_file.name
        
        # Open the Numbers document
        doc = Document(file_path)
        
        result = {
            "success": True,
            "sheets": []
        }
        
        # Process each sheet
        for sheet in doc.sheets:
            sheet_data = {
                "name": sheet.name,
                "tables": []
            }
            
            # Process each table in the sheet
            for table in sheet.tables:
                # Extract headers from first row
                headers = []
                for col_idx in range(table.num_cols):
                    cell = table.cell(0, col_idx)
                    header = str(cell.value) if cell.value is not None else f'Column{col_idx + 1}'
                    headers.append(header)
                
                # Extract data rows
                rows = []
                for row_idx in range(1, table.num_rows):  # Skip header row
                    row_data = {}
                    for col_idx in range(table.num_cols):
                        cell = table.cell(row_idx, col_idx)
                        header = headers[col_idx]
                        # Convert value to string, handle None
                        value = cell.value
                        if value is None:
                            row_data[header] = ''
                        elif isinstance(value, (int, float)):
                            row_data[header] = value
                        else:
                            row_data[header] = str(value)
                    rows.append(row_data)
                
                table_data = {
                    "name": table.name,
                    "headers": headers,
                    "rows": rows,
                    "num_rows": len(rows),
                    "num_cols": len(headers)
                }
                
                sheet_data["tables"].append(table_data)
            
            result["sheets"].append(sheet_data)
        
        # Clean up temp file if created
        if temp_file:
            try:
                Path(temp_file.name).unlink()
            except:
                pass
        
        # Format output
        if output_format == 'csv':
            # Return first table as CSV
            if result["sheets"] and result["sheets"][0]["tables"]:
                first_table = result["sheets"][0]["tables"][0]
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=first_table["headers"])
                writer.writeheader()
                writer.writerows(first_table["rows"])
                return {
                    "success": True,
                    "format": "csv",
                    "data": output.getvalue(),
                    "num_rows": first_table["num_rows"],
                    "num_cols": first_table["num_cols"]
                }
        
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }


if __name__ == "__main__":
    # Command line usage
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python numbers-parser.py <file_path> [output_format]"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else 'json'
    
    result = parse_numbers_file(file_path, output_format)
    print(json.dumps(result, indent=2))
