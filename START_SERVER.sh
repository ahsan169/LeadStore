#!/bin/bash

# Start server script - fixes port 5000 issue and database requirement

echo "🚀 Starting LeadStorefrontAI Server..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set. Using mock database for testing..."
  echo "💡 To use a real database, set DATABASE_URL in .env file"
  echo ""
  echo "For local PostgreSQL:"
  echo "  export DATABASE_URL='postgresql://user:password@localhost:5432/leadstorefront'"
  echo ""
  echo "For Neon (free tier):"
  echo "  export DATABASE_URL='postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname'"
  echo ""
  echo "Starting with mock database (some features may not work)..."
  export DATABASE_URL="postgresql://mock:mock@localhost:5432/mock"
fi

# Use port 3000 instead of 5000 (5000 is used by Apple AirPlay)
export PORT=3000
export NODE_ENV=development

echo "📡 Server will run on: http://localhost:3000"
echo ""

# Start the server
npm run dev


