# Database Setup Guide

## Quick Setup - Free Neon Database (Recommended) ⭐

### Step 1: Create Free Neon Account
1. Go to [neon.tech](https://neon.tech)
2. Click "Sign Up" (free, no credit card needed)
3. Sign up with GitHub, Google, or email

### Step 2: Create Database
1. After signing in, click **"Create Project"**
2. Choose a project name (e.g., "leadstorefront")
3. Select a region (closest to you)
4. Click **"Create Project"**

### Step 3: Get Connection String
1. In your Neon dashboard, you'll see your project
2. Click on **"Connection Details"** or **"Connection String"**
3. Copy the connection string (looks like):
   ```
   postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 4: Add to Your Project
1. Open your `.env` file in the project root
2. Add this line:
   ```
   DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   (Replace with your actual connection string)

3. Save the file

### Step 5: Run Database Migrations
```bash
cd /Users/user/Downloads/LeadStorefrontAI
npm run db:push
```

### Step 6: Start Server
```bash
PORT=3000 npm run dev
```

**That's it!** Your database is ready. 🎉

---

## Alternative: Local PostgreSQL

If you prefer to run PostgreSQL locally:

### Install PostgreSQL (macOS)
```bash
# Using Homebrew
brew install postgresql@16
brew services start postgresql@16

# Create database
createdb leadstorefront

# Set DATABASE_URL
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/leadstorefront"
```

### Add to .env
```
DATABASE_URL=postgresql://yourusername@localhost:5432/leadstorefront
```

---

## Quick Test Without Database (Frontend Only)

If you just want to test the frontend and API calls, you can temporarily modify the code, but **this is not recommended** as many features won't work.

**Better option:** Use the free Neon database above - it takes 2 minutes to set up!

---

## Troubleshooting

### "Connection refused"
- Check your connection string is correct
- Make sure the database is running (for local) or project is active (for Neon)

### "Authentication failed"
- Verify username and password in connection string
- For Neon, make sure you copied the full connection string

### "Database does not exist"
- Run migrations: `npm run db:push`
- Or create the database manually

---

## Need Help?

- **Neon Docs:** https://neon.tech/docs
- **Neon Support:** Very responsive, great free tier
- **Local Setup:** See PostgreSQL documentation

---

**Recommended:** Use Neon - it's free, fast, and takes 2 minutes to set up!


