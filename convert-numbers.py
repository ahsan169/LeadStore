#!/usr/bin/env python3

import zipfile
import sys
import json

def extract_numbers_data(numbers_file):
    """Extract data from a Numbers file (which is actually a ZIP archive)"""
    try:
        # Numbers files are ZIP archives
        with zipfile.ZipFile(numbers_file, 'r') as z:
            # List all files in the archive
            file_list = z.namelist()
            print(f"Files in Numbers archive: {file_list[:10]}...")  # Show first 10
            
            # Try to find and extract index files
            for name in file_list:
                if 'index' in name.lower() and name.endswith('.xml'):
                    content = z.read(name).decode('utf-8', errors='ignore')
                    print(f"\n{name} preview (first 500 chars):")
                    print(content[:500])
                    
            # Look for CSV exports or table data
            for name in file_list:
                if name.endswith('.csv'):
                    content = z.read(name).decode('utf-8', errors='ignore')
                    print(f"\nFound CSV: {name}")
                    print("First 5 lines:")
                    lines = content.split('\n')[:5]
                    for line in lines:
                        print(line)
                        
    except zipfile.BadZipFile:
        print("Not a valid ZIP/Numbers file. Let me try to read it as CSV...")
        # Maybe it's already a CSV with wrong extension
        with open(numbers_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()[:10]
            print("First 10 lines of file:")
            for i, line in enumerate(lines):
                print(f"Line {i}: {line[:200]}")  # First 200 chars of each line
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_numbers_data('attached_assets/mca_top_2000_enriched_1761272812627.numbers')