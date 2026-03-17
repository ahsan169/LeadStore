#!/bin/bash

echo "🚀 Database Setup Helper"
echo ""
echo "You need a PostgreSQL database to run this app."
echo ""
echo "Option 1: Free Neon Database (Recommended - 2 minutes)"
echo "  1. Go to https://neon.tech and sign up (free)"
echo "  2. Create a new project"
echo "  3. Copy the connection string"
echo "  4. Run this command:"
echo "     echo 'DATABASE_URL=your_connection_string_here' >> .env"
echo ""
echo "Option 2: I'll help you add it manually"
echo ""
read -p "Do you have a Neon connection string ready? (y/n): " has_string

if [ "$has_string" = "y" ] || [ "$has_string" = "Y" ]; then
  read -p "Paste your DATABASE_URL connection string: " db_url
  if [ ! -z "$db_url" ]; then
    # Check if DATABASE_URL already exists in .env
    if grep -q "DATABASE_URL" .env 2>/dev/null; then
      echo "⚠️  DATABASE_URL already exists in .env"
      read -p "Replace it? (y/n): " replace
      if [ "$replace" = "y" ] || [ "$replace" = "Y" ]; then
        # Remove old DATABASE_URL line
        sed -i '' '/^DATABASE_URL=/d' .env
        echo "DATABASE_URL=$db_url" >> .env
        echo "✅ Updated DATABASE_URL in .env"
      fi
    else
      echo "DATABASE_URL=$db_url" >> .env
      echo "✅ Added DATABASE_URL to .env"
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Run: npm run db:push"
    echo "  2. Run: PORT=3000 npm run dev"
    echo ""
  else
    echo "❌ No connection string provided"
  fi
else
  echo ""
  echo "📖 Quick Setup Guide:"
  echo ""
  echo "1. Go to: https://neon.tech"
  echo "2. Sign up (free, no credit card)"
  echo "3. Create a new project"
  echo "4. Copy the connection string"
  echo "5. Run this script again or add to .env manually:"
  echo "   echo 'DATABASE_URL=your_connection_string' >> .env"
  echo ""
  echo "See QUICK_DATABASE_SETUP.md for detailed instructions"
fi


