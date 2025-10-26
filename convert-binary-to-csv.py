#!/usr/bin/env python3
"""Convert binary Excel/Numbers files to CSV format"""
import sys
import pandas as pd
import json

def convert_to_csv(input_file, output_file=None):
    """Convert Excel/Numbers file to CSV"""
    try:
        # Try reading as Excel first
        df = pd.read_excel(input_file, engine='openpyxl')
        
        # Generate output filename if not provided
        if output_file is None:
            output_file = input_file.replace('.csv', '_converted.csv')
            if output_file == input_file:
                output_file = input_file + '_converted.csv'
        
        # Save as CSV
        df.to_csv(output_file, index=False)
        
        # Print info about the conversion
        print(json.dumps({
            'success': True,
            'input': input_file,
            'output': output_file,
            'rows': len(df),
            'columns': list(df.columns)
        }))
        
        return output_file
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python convert-binary-to-csv.py <input_file> [output_file]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    convert_to_csv(input_file, output_file)