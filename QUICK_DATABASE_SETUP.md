# Quick Database Setup (2 Minutes) ⚡

## Option 1: Free Neon Database (Easiest - Recommended) ⭐

### Step 1: Sign Up (30 seconds)
1. Go to **https://neon.tech**
2. Click **"Sign Up"** (free, no credit card)
3. Sign up with GitHub, Google, or email

### Step 2: Create Database (30 seconds)
1. Click **"Create Project"**
2. Name it: `leadstorefront`
3. Select region (choose closest to you)
4. Click **"Create Project"**

### Step 3: Copy Connection String (30 seconds)
1. In your project dashboard, find **"Connection Details"**
2. Click **"Connection String"** tab
3. Copy the connection string (looks like):
   ```
   postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 4: Add to .env File (30 seconds)
1. Open `.env` file in your project
2. Add this line (replace with your connection string):
   ```
   DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Save the file

### Step 5: Run Migrations & Start
```bash
cd /Users/user/Downloads/LeadStorefrontAI
npm run db:push
PORT=3000 npm run dev
```

**Done!** Your app will be at `http://localhost:3000` 🎉

---

## Option 2: Local PostgreSQL

If you have PostgreSQL installed:

```bash
# Create database
createdb leadstorefront

# Add to .env
echo "DATABASE_URL=postgresql://$(whoami)@localhost:5432/leadstorefront" >> .env

# Run migrations
npm run db:push

# Start server
PORT=3000 npm run dev
```

---

## Why You Need a Database

The app uses PostgreSQL to store:
- User accounts
- Lead data
- Company information
- Search history
- And more...

**Neon is free and perfect for development!** No credit card needed.

---

## Need Help?

- **Neon Setup Video:** https://neon.tech/docs/quickstart
- **Neon is very developer-friendly** - great free tier!

---

**Recommended:** Use Neon - it's the fastest way to get started! 🚀


