# MCA Lead Generator - Colorado & Florida

## Overview
Daily automated data pipelines that fetch UCC filings and business records to generate high-quality leads for Merchant Cash Advance (MCA) businesses.

## Pipelines

### Colorado UCC Pipeline (`main.py`)
Fetches Colorado UCC financing statements from the Socrata API.

**Data Sources:**
- Filings (wffy-3uut): UCC financing statement filing information
- Debtors (8upq-58vz): Business/debtor name and address
- Secured Parties (ap62-sav4): Lender/creditor information

**Lead Scoring (0-100):**
- Bank UCCs: +30 points (higher quality, stronger credit)
- Equipment Finance: +25 points (asset-based, open to working capital)
- Other lenders: +10 points
- MCA Companies: Excluded (often indicate defaults)
- Filing age 30-120 days: +20 points (sweet spot for refinancing)
- Data completeness: +5 points each for name and address

**Output:** `co_ucc_mca_leads.csv`

### Florida Business Pipeline (`florida_pipeline.py`)
Fetches Florida corporate filings and federal tax lien records via SFTP.

**Data Sources (SFTP sftp.floridados.gov):**
- Corporate filings (doc/cor): New business registrations
- Federal lien filings (doc/flr/filings): Tax lien filing info
- Federal lien debtors (doc/flr/debtors): Debtor names/addresses

**Lead Scoring:**
- Federal tax lien leads: 90 base score (businesses in financial distress)
- New corporate filings: 70 base score (fresh businesses needing capital)
- Recency bonus: +10 for filings < 7 days old

**Output:** `fl_mca_leads.csv`

## Project Structure
```
main.py                  # Colorado UCC pipeline
florida_pipeline.py      # Florida corporate/lien pipeline
run_all_pipelines.py     # Combined runner for scheduled deployment
requirements.txt         # Python dependencies
co_ucc_mca_leads.csv     # Colorado leads output
fl_mca_leads.csv         # Florida leads output
processed_fileids.json   # Colorado incremental tracking
data/                    # Downloaded Florida files
```

## Environment Variables
- `SOCRATA_APP_TOKEN` - Colorado Socrata API token
- `FL_SFTP_PASSWORD` - Florida SFTP password (default: PubAccess1845!)

## Running the Pipelines

### Manual Run
- Colorado: Run the "Run Data Pipeline" workflow
- Florida: Run the "Run Florida Pipeline" workflow

### Daily Scheduled Deployment
The project is configured for scheduled deployment that runs both pipelines:
1. Go to Deployments
2. Choose "Scheduled"
3. Set your preferred schedule (e.g., "Every day at 6 AM")
4. Publish

This runs `run_all_pipelines.py` which executes Colorado first, then Florida.

## Lead Quality Notes
- Bank and equipment finance UCCs are highest quality
- Federal tax liens indicate businesses needing cash urgently
- New corporate filings = fresh businesses seeking funding
- Deduplication and blank name filtering applied to all outputs
