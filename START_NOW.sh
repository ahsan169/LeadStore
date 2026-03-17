#!/bin/bash

echo "🚀 Starting LeadStorefrontAI Server..."
echo ""

cd /Users/user/Downloads/LeadStorefrontAI

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL=" .env 2>/dev/null; then
  echo "⚠️  DATABASE_URL not found in .env"
  echo ""
  echo "You need a PostgreSQL database. Quick setup:"
  echo ""
  echo "1. Go to https://neon.tech (free, 2 minutes)"
  echo "2. Sign up and create a project"
  echo "3. Copy the connection string"
  echo "4. Add it to .env:"
  echo "   echo 'DATABASE_URL=your_connection_string' >> .env"
  echo ""
  echo "Or install PostgreSQL locally:"
  echo "   brew install postgresql@16"
  echo "   createdb leadstorefront"
  echo "   echo 'DATABASE_URL=postgresql://\$(whoami)@localhost:5432/leadstorefront' >> .env"
  echo ""
  read -p "Press Enter to continue anyway (will fail without database) or Ctrl+C to set up database first..."
fi

# Check if SEAMLESS_API_KEY is set
if grep -q "SEAMLESS_API_KEY=" .env 2>/dev/null; then
  echo "✅ SEAMLESS_API_KEY found"
else
  echo "⚠️  SEAMLESS_API_KEY not found"
fi

echo ""
echo "📡 Starting server on port 3000..."
echo "   (Port 5000 is blocked by Apple AirPlay)"
echo ""
echo "🌐 Access at: http://localhost:3000"
echo ""

# Export environment variables
export PORT=3000
export NODE_ENV=development

# Load .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Start the server
npm run dev


