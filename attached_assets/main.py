import os
import json
import requests
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

APP_TOKEN = os.environ["SOCRATA_APP_TOKEN"]
BASE = "https://data.colorado.gov/resource"

BANK_KEYWORDS = [
    " bank", "bank,", "bank ", "national bank", "savings bank", "credit union", 
    "federal credit", "trust company", ", n.a.", " n.a.", " fsb", "federal savings",
    "wells fargo", "chase", "jpmorgan", "citibank", "u.s. bank", "pnc bank",
    "fifth third", "regions bank", "truist", "huntington bank", "keybank",
    "citizens bank", "td bank", "m&t bank", "first national", "first citizens"
]

EQUIPMENT_FINANCE_KEYWORDS = [
    "equipment finance", "equipment leasing", "caterpillar financial",
    "john deere financial", "toyota financial", "ford credit", "ford motor credit",
    "gm financial", "de lage landen", "cit group", "paccar financial",
    "daimler truck", "volvo financial", "kubota credit", "agco finance",
    "ally financial", "bmw financial", "mercedes-benz financial"
]

KNOWN_MCA_COMPANIES = [
    "ondeck", "kabbage", "bluevine", "can capital", "rapid advance", 
    "quick capital", "business backer", "credibly", "lendio", "fundbox", 
    "square capital", "paypal working capital", "shopify capital", 
    "amazon lending", "merchant cash", "clearco", "pipe technologies",
    "wayflyer", "capchase", "ramp", "brex", "fundthrough", "behalf",
    "liberis", "forward financing", "fora financial", "greenbox capital",
    "national funding", "balboa capital", "crestmont capital", "yellowstone capital",
    "leaf capital", "nitro advance", "lily advance", "bizfund", "bizfi",
    "newtek", "newco capital", "swift capital", "strategic funding",
    "united capital", "snap advances", "reliant funding", "cfgms",
    "american express merchant", "payability", "fundkite", "creditera",
    "funding metrics", "zlur funding", "unique funding", "fenix capital",
    "alternative funding", "cfg merchant", "microadvance", "epic advance",
    "parkview advance", "broadway advance", "g6 advance", "barclays advance",
    "fc capital holdings", "star capital group", "oakmont capital", "dext capital",
    "targeted lending", "port 51 lending", "readycap lending", "rwc lending",
    "navitas credit", "north mill credit", "factoring", "complete business solutions",
    "secured lender solutions", "customer payment solutions", "newlane finance"
]

PROCESSED_FILE = "processed_fileids.json"
OUTPUT_FILE = "co_ucc_mca_leads.csv"
TOP_LEADS_FILE = "top_mca_leads.csv"
TOP_LEADS_MIN_SCORE = 85

DAYS_BACK_MIN = 0
DAYS_BACK_MAX = 120


def load_processed_fileids():
    if Path(PROCESSED_FILE).exists():
        with open(PROCESSED_FILE, "r") as f:
            return set(json.load(f))
    return set()


def save_processed_fileids(fileids):
    with open(PROCESSED_FILE, "w") as f:
        json.dump(list(fileids), f)


def classify_secured_party(name):
    if not name:
        return "unknown", 50
    
    name_lower = name.lower()
    
    for keyword in BANK_KEYWORDS:
        if keyword in name_lower:
            return "bank", 90
    
    for keyword in EQUIPMENT_FINANCE_KEYWORDS:
        if keyword in name_lower:
            return "equipment_finance", 85
    
    for keyword in KNOWN_MCA_COMPANIES:
        if keyword in name_lower:
            return "mca_company", 95
    
    return "other", 60


def calculate_lead_score(row):
    score = 50
    
    if "sp_type" in row:
        if row["sp_type"] == "mca_company":
            score += 40
        elif row["sp_type"] == "bank":
            score += 30
        elif row["sp_type"] == "equipment_finance":
            score += 25
        elif row["sp_type"] == "other":
            score += 10
    
    if "days_since_filing" in row and pd.notna(row["days_since_filing"]):
        days = row["days_since_filing"]
        if 30 <= days <= 120:
            score += 20
        elif 120 < days <= 180:
            score += 10
        elif days < 30:
            score -= 10
    
    if "debtor_name" in row and pd.notna(row["debtor_name"]):
        score += 5
    if "debtor_address" in row and pd.notna(row["debtor_address"]):
        score += 5
    
    return max(0, min(100, score))


def fetch_filings(start_date=None, end_date=None):
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=DAYS_BACK_MAX)).strftime("%Y-%m-%dT00:00:00")
    if end_date is None:
        end_date = (datetime.now() - timedelta(days=DAYS_BACK_MIN)).strftime("%Y-%m-%dT23:59:59")

    select_fields = ",".join([
        "transactionid",
        "masterdocumentid",
        "filingdate",
        "filingtype",
        "documenttype",
        "continuation",
        "terminationflag",
        "fileid",
    ])

    where_clause = (
        f"documenttype = 'UCC financing statement' "
        f"AND continuation = false "
        f"AND terminationflag = false "
        f"AND filingdate >= '{start_date}' "
        f"AND filingdate <= '{end_date}'"
    )

    params = {
        "$select": select_fields,
        "$where": where_clause,
        "$limit": 50000,
    }

    print(f"Fetching filings from {start_date[:10]} to {end_date[:10]}...")
    r = requests.get(
        f"{BASE}/wffy-3uut.json",
        params=params,
        headers={"X-App-Token": APP_TOKEN},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    return pd.DataFrame(data)


def fetch_debtors(fileids, chunk_size=800):
    fileids = [fid for fid in fileids if fid]
    fileids = list(dict.fromkeys(fileids))

    all_rows = []

    for i in range(0, len(fileids), chunk_size):
        chunk = fileids[i:i + chunk_size]
        in_clause = ",".join(f"'{fid}'" for fid in chunk)

        select_fields = ",".join([
            "fileid",
            "organizationname",
            "address1",
            "city",
            "state",
            "zipcode",
        ])

        params = {
            "$select": select_fields,
            "$where": f"fileid in ({in_clause})",
            "$limit": 50000,
        }

        r = requests.get(
            f"{BASE}/8upq-58vz.json",
            params=params,
            headers={"X-App-Token": APP_TOKEN},
            timeout=60,
        )
        r.raise_for_status()
        rows = r.json()
        if rows:
            all_rows.extend(rows)

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df = df.rename(columns={
        "organizationname": "debtor_name",
        "address1": "debtor_address",
        "city": "debtor_city",
        "state": "debtor_state",
        "zipcode": "debtor_zip",
    })
    return df


def fetch_secured_parties(fileids, chunk_size=800):
    fileids = [fid for fid in fileids if fid]
    fileids = list(dict.fromkeys(fileids))

    all_rows = []

    for i in range(0, len(fileids), chunk_size):
        chunk = fileids[i:i + chunk_size]
        in_clause = ",".join(f"'{fid}'" for fid in chunk)

        select_fields = ",".join([
            "fileid",
            "organizationname",
            "firstname",
            "lastname",
            "address1",
            "city",
            "state",
            "zipcode",
        ])

        params = {
            "$select": select_fields,
            "$where": f"fileid in ({in_clause})",
            "$limit": 50000,
        }

        r = requests.get(
            f"{BASE}/ap62-sav4.json",
            params=params,
            headers={"X-App-Token": APP_TOKEN},
            timeout=60,
        )
        r.raise_for_status()
        rows = r.json()
        if rows:
            all_rows.extend(rows)

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    
    df["secured_party_name"] = df.apply(
        lambda x: x.get("organizationname") or f"{x.get('firstname', '')} {x.get('lastname', '')}".strip(),
        axis=1
    )
    
    df = df.rename(columns={
        "address1": "sp_address",
        "city": "sp_city",
        "state": "sp_state",
        "zipcode": "sp_zip",
    })
    
    df = df[["fileid", "secured_party_name", "sp_address", "sp_city", "sp_state", "sp_zip"]]
    
    return df


def main():
    print("=" * 60)
    print("Colorado UCC MCA Lead Generator")
    print(f"Run date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    processed_fileids = load_processed_fileids()
    print(f"Previously processed fileids: {len(processed_fileids)}")
    
    print(f"\nFetching recent UCC filings ({DAYS_BACK_MIN}-{DAYS_BACK_MAX} days old)...")
    filings = fetch_filings()
    print(f"Total filings found: {len(filings)}")
    
    if filings.empty:
        print("No filings found in date range. Exiting.")
        return
    
    filings["fileid"] = filings["fileid"].astype(str)
    new_filings = filings[~filings["fileid"].isin(processed_fileids)]
    print(f"New filings to process: {len(new_filings)}")
    
    if new_filings.empty:
        print("No new filings to process. Exiting.")
        return
    
    fileids = new_filings["fileid"].dropna().tolist()
    print(f"\nFetching debtor records for {len(fileids)} filings...")
    debtors = fetch_debtors(fileids)
    print(f"Debtor records found: {len(debtors)}")
    
    print(f"\nFetching secured party (lender) records...")
    secured_parties = fetch_secured_parties(fileids)
    print(f"Secured party records found: {len(secured_parties)}")
    
    print("\nMerging data...")
    merged = new_filings.merge(debtors, on="fileid", how="left")
    
    if not secured_parties.empty:
        sp_grouped = secured_parties.groupby("fileid").first().reset_index()
        merged = merged.merge(sp_grouped, on="fileid", how="left")
    
    if "filingdate" in merged.columns:
        merged["filingdate"] = pd.to_datetime(merged["filingdate"])
        merged["days_since_filing"] = (datetime.now() - merged["filingdate"]).dt.days
    
    print("\nClassifying secured parties and scoring leads...")
    if "secured_party_name" in merged.columns:
        classifications = merged["secured_party_name"].apply(classify_secured_party)
        merged["sp_type"] = classifications.apply(lambda x: x[0])
        merged["sp_type_score"] = classifications.apply(lambda x: x[1])
    else:
        merged["sp_type"] = "unknown"
        merged["sp_type_score"] = 50
    
    merged["lead_score"] = merged.apply(calculate_lead_score, axis=1)
    
    print("\nFiltering for high-quality MCA leads...")
    high_quality = merged.copy()
    print(f"Total leads before filtering: {len(high_quality)}")
    
    if "debtor_name" in high_quality.columns:
        high_quality = high_quality[high_quality["debtor_name"].notna() & (high_quality["debtor_name"].str.strip() != "")]
        print(f"Leads after removing blank debtor names: {len(high_quality)}")
    
    high_quality = high_quality.drop_duplicates(subset=["fileid", "debtor_name"], keep="first")
    print(f"Leads after removing duplicates: {len(high_quality)}")
    
    high_quality = high_quality.sort_values(
        ["lead_score", "filingdate"],
        ascending=[False, False]
    )
    
    output_columns = [
        "fileid",
        "transactionid",
        "filingdate",
        "days_since_filing",
        "lead_score",
        "debtor_name",
        "debtor_address",
        "debtor_city",
        "debtor_state",
        "debtor_zip",
        "secured_party_name",
        "sp_type",
        "sp_address",
        "sp_city",
        "sp_state",
        "sp_zip",
        "documenttype",
        "filingtype",
    ]
    
    available_columns = [c for c in output_columns if c in high_quality.columns]
    output_df = high_quality[available_columns]
    
    if Path(OUTPUT_FILE).exists():
        existing = pd.read_csv(OUTPUT_FILE)
        if "filingdate" in existing.columns:
            existing["filingdate"] = pd.to_datetime(existing["filingdate"])
        output_df = pd.concat([output_df, existing], ignore_index=True)
        output_df = output_df.drop_duplicates(subset=["fileid"], keep="first")
        output_df = output_df.sort_values(
            ["lead_score", "filingdate"],
            ascending=[False, False]
        )
    
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved {len(output_df)} total leads to {OUTPUT_FILE}")
    
    top_leads = output_df[output_df["lead_score"] >= TOP_LEADS_MIN_SCORE].copy()
    top_leads.to_csv(TOP_LEADS_FILE, index=False)
    print(f"Saved {len(top_leads)} top leads (score {TOP_LEADS_MIN_SCORE}+) to {TOP_LEADS_FILE}")
    
    all_processed = processed_fileids.union(set(new_filings["fileid"].tolist()))
    save_processed_fileids(all_processed)
    print(f"Updated processed fileids tracker: {len(all_processed)} total")
    
    print("\n" + "=" * 60)
    print("LEAD SUMMARY")
    print("=" * 60)
    print(f"New leads added: {len(high_quality)}")
    print(f"Total leads in file: {len(output_df)}")
    
    if "sp_type" in output_df.columns:
        print("\nLeads by Secured Party Type:")
        print(output_df["sp_type"].value_counts().to_string())
    
    if "lead_score" in output_df.columns:
        print(f"\nLead Score Stats:")
        print(f"  Average: {output_df['lead_score'].mean():.1f}")
        print(f"  High (80+): {len(output_df[output_df['lead_score'] >= 80])}")
        print(f"  Medium (50-79): {len(output_df[(output_df['lead_score'] >= 50) & (output_df['lead_score'] < 80)])}")
        print(f"  Low (<50): {len(output_df[output_df['lead_score'] < 50])}")
    
    print("\n" + "=" * 60)
    print("Done!")


if __name__ == "__main__":
    main()
