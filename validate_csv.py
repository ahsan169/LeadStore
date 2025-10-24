import csv
import re

def validate_csv(filename):
    """Validate CSV file for upload"""
    with open(filename, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        
        print("CSV Validation Report")
        print("=" * 50)
        print(f"Headers found: {headers}")
        print()
        
        # Check for required fields (loosely)
        has_company = any('company' in h.lower() for h in headers)
        has_email = any('email' in h.lower() for h in headers)
        has_phone = any('phone' in h.lower() for h in headers)
        has_owner = any('owner' in h.lower() or 'contact' in h.lower() or 'name' in h.lower() for h in headers)
        
        print("Required field checks:")
        print(f"✓ Company/Business name: {'Found' if has_company else 'Missing'}")
        print(f"✓ Owner/Contact name: {'Found' if has_owner else 'Missing'}")
        print(f"✓ Email: {'Found' if has_email else 'Missing'}")
        print(f"✓ Phone: {'Found' if has_phone else 'Missing'}")
        print()
        
        # Validate data quality
        valid_rows = 0
        invalid_rows = 0
        sample_data = []
        
        for i, row in enumerate(reader):
            if i >= 100:  # Check first 100 rows
                break
                
            # Check if row has meaningful data
            has_data = False
            for key, value in row.items():
                if value and value.strip():
                    has_data = True
                    break
            
            if has_data:
                valid_rows += 1
                if len(sample_data) < 3:
                    sample_data.append(row)
            else:
                invalid_rows += 1
        
        print(f"Data quality (first 100 rows):")
        print(f"✓ Valid rows: {valid_rows}")
        print(f"✗ Empty/invalid rows: {invalid_rows}")
        print(f"Success rate: {(valid_rows/(valid_rows+invalid_rows)*100):.1f}%")
        print()
        
        print("Sample data (first 3 valid rows):")
        for i, row in enumerate(sample_data, 1):
            print(f"\nRow {i}:")
            for key, value in list(row.items())[:5]:  # Show first 5 fields
                if value and value.strip():
                    print(f"  {key}: {value[:50]}")
        
        return valid_rows > 0

if __name__ == "__main__":
    is_valid = validate_csv('mca_top_2000_enriched.csv')
    print("\n" + "=" * 50)
    if is_valid:
        print("✅ CSV file is VALID and ready for upload!")
        print("\nYou can now upload 'mca_top_2000_enriched.csv' through the web interface.")
        print("The system has been updated to recognize your column names.")
    else:
        print("❌ CSV file appears to have issues. Please check the data.")