#!/usr/bin/env python

from numbers_parser import Document
import pandas as pd
import csv
import sys

def convert_numbers_to_csv(input_file, output_file):
    """Convert Apple Numbers file to CSV"""
    try:
        # Parse the Numbers file
        print(f"Opening Numbers file: {input_file}")
        doc = Document(input_file)
        
        # Get the first sheet (or table)
        sheets = doc.sheets
        if not sheets:
            print("No sheets found in Numbers file")
            return False
            
        sheet = sheets[0]
        tables = sheet.tables
        if not tables:
            print("No tables found in first sheet")
            return False
            
        table = tables[0]
        
        # Get dimensions
        num_rows = table.num_rows
        num_cols = table.num_cols
        print(f"Table has {num_rows} rows and {num_cols} columns")
        
        # Extract data
        data = []
        
        # Get headers first
        headers = []
        for col in range(num_cols):
            cell = table.cell(0, col)
            headers.append(str(cell.value) if cell.value is not None else f"Column_{col}")
        
        print(f"\nHeaders found: {headers}")
        data.append(headers)
        
        # Get data rows (starting from row 1, assuming row 0 is headers)
        print(f"Processing {min(5, num_rows-1)} sample rows...")
        for row in range(1, min(num_rows, 6)):  # Sample first 5 data rows
            row_data = []
            for col in range(num_cols):
                cell = table.cell(row, col)
                row_data.append(str(cell.value) if cell.value is not None else "")
            data.append(row_data)
            print(f"Row {row}: {row_data[:3]}...")  # Show first 3 columns
        
        # Save full data to CSV
        print(f"\nExtracting all {num_rows} rows to CSV...")
        all_data = []
        all_data.append(headers)
        
        for row in range(1, num_rows):
            row_data = []
            for col in range(num_cols):
                cell = table.cell(row, col)
                value = cell.value
                # Handle different types
                if value is None:
                    row_data.append("")
                elif isinstance(value, (int, float)):
                    row_data.append(str(value))
                else:
                    row_data.append(str(value))
            all_data.append(row_data)
        
        # Write to CSV
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(all_data)
        
        print(f"Successfully converted to {output_file}")
        print(f"Total rows written: {len(all_data)}")
        return True
        
    except Exception as e:
        print(f"Error converting Numbers file: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    input_file = 'attached_assets/mca_top_2000_enriched_1761272812627.numbers'
    output_file = 'mca_top_2000_enriched.csv'
    
    if convert_numbers_to_csv(input_file, output_file):
        print(f"\n✅ Conversion successful! CSV saved as {output_file}")
    else:
        print("\n❌ Conversion failed")