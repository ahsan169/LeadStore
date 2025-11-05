#!/bin/bash

echo "=== Testing Upload Fallback Mechanism ==="
echo ""

# Create a simple test CSV file
echo "Creating test CSV file..."
cat > test_upload.csv << EOF
Business Name,Owner Name,Email,Phone,Industry,Annual Revenue,City,State
Acme Corp,John Doe,john@acme.com,555-0001,Technology,1000000,New York,NY
Beta LLC,Jane Smith,jane@beta.com,555-0002,Retail,500000,Los Angeles,CA
Gamma Inc,Bob Johnson,bob@gamma.com,555-0003,Manufacturing,750000,Chicago,IL
EOF

echo "Test CSV file created: test_upload.csv"
echo ""

# Check if S3 is configured
if [ -z "$DEFAULT_OBJECT_STORAGE_BUCKET_ID" ]; then
    echo "✅ S3 not configured - fallback to local storage will be used"
else
    echo "S3 is configured with bucket: $DEFAULT_OBJECT_STORAGE_BUCKET_ID"
fi

echo ""
echo "Checking if server is running..."
curl -s http://localhost:5000/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Server is running on port 5000"
else
    echo "⚠️ Server may not be responding on port 5000"
fi

echo ""
echo "Checking if uploads directory exists..."
if [ -d "uploads" ]; then
    echo "✅ Uploads directory exists"
    ls -la uploads/
else
    echo "ℹ️ Uploads directory will be created when needed"
fi

echo ""
echo "Test setup complete!"
echo ""
echo "To test the upload with fallback:"
echo "1. Try uploading a file via the admin interface"
echo "2. Check the server logs for fallback messages"
echo "3. Verify files are stored in uploads/batches/ directory"

# Clean up
rm -f test_upload.csv