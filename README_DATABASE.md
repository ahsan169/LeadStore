# ⚡ Quick Start - Database Setup

## You Need a Database URL

The app requires a PostgreSQL database. **Don't worry - it's free and takes 2 minutes!**

---

## 🚀 Fastest Way: Neon (Free)

### 1. Get Free Database (2 minutes)

1. **Go to:** https://neon.tech
2. **Sign up** (free, no credit card needed)
3. **Create Project** → Name it `leadstorefront`
4. **Copy Connection String** (from Connection Details)

### 2. Add to Your .env File

```bash
cd /Users/user/Downloads/LeadStorefrontAI

# Add DATABASE_URL to .env
echo 'DATABASE_URL=your_neon_connection_string_here' >> .env
```

**Or edit `.env` manually and add:**
```
DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 3. Run Migrations & Start

```bash
# Create database tables
npm run db:push

# Start server on port 3000 (port 5000 is blocked by Apple AirPlay)
PORT=3000 npm run dev
```

### 4. Access Your App

Open: **http://localhost:3000**

---

## 🎯 What You'll Get

- ✅ Free PostgreSQL database (Neon free tier)
- ✅ No credit card required
- ✅ 2 minutes setup time
- ✅ Perfect for development

---

## 📝 Alternative: Use Setup Script

```bash
./SETUP_DATABASE.sh
```

This will guide you through adding the DATABASE_URL.

---

## ❓ Why Do I Need This?

The app stores:
- User accounts
- Lead data  
- Company information
- Search results
- And more...

**Neon is perfect for this - free, fast, and easy!**

---

## 🆘 Need Help?

- **Neon Docs:** https://neon.tech/docs
- **See:** `QUICK_DATABASE_SETUP.md` for detailed steps

---

**Ready?** Go to https://neon.tech and get your free database! 🚀


