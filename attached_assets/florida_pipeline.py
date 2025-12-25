import os
import re
import time
import random
from pathlib import Path
from datetime import datetime

import paramiko
import pandas as pd

HOST = os.getenv("FL_SFTP_HOST", "sftp.floridados.gov")
USER = os.getenv("FL_SFTP_USER", "Public")
PASSWORD = os.getenv("FL_SFTP_PASSWORD", "PubAccess1845!")

BASE_REMOTE_DIRS = {
    "corp_filings": "doc/cor",
    "fed_lien_filings": "doc/flr/filings",
    "fed_lien_debtors": "doc/flr/debtors",
}

LOCAL_DATA_DIR = Path("data")
LOCAL_DATA_DIR.mkdir(exist_ok=True)

OUTPUT_FILE = "fl_mca_leads.csv"


def human_pause(min_sec: float = 1.5, max_sec: float = 4.0, label: str = ""):
    delay = random.uniform(min_sec, max_sec)
    if label:
        print(f"[pause] {label} - {delay:.1f}s...")
    time.sleep(delay)


def connect_sftp():
    human_pause(1.0, 2.0, label="connecting")
    print(f"Connecting to SFTP {HOST} as {USER}...")
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)
    human_pause(0.5, 1.5, label="connected")
    return sftp, transport


def latest_daily_file(sftp, remote_dir: str, pattern_suffix: str) -> str | None:
    print(f"Listing: {remote_dir}")
    human_pause(0.5, 1.5, label="listing")
    files = sftp.listdir(remote_dir)
    human_pause(0.3, 1.0, label="listed")

    regex = re.compile(r"(\d{8})" + re.escape(pattern_suffix))
    candidates = []
    for name in files:
        m = regex.fullmatch(name)
        if m:
            date_str = m.group(1)
            candidates.append((date_str, name))

    if not candidates:
        print(f"No files matching *{pattern_suffix} in {remote_dir}")
        return None

    candidates.sort(key=lambda x: x[0])
    latest_name = candidates[-1][1]
    latest_path = f"{remote_dir}/{latest_name}"
    print(f"Latest file: {latest_name}")
    return latest_path


def download_remote_file(sftp, remote_path: str) -> Path:
    local_path = LOCAL_DATA_DIR / Path(remote_path).name
    print(f"Downloading {remote_path}...")
    human_pause(0.5, 1.5, label="downloading")
    sftp.get(remote_path, str(local_path))
    human_pause(0.3, 1.0, label="downloaded")
    print(f"Saved to {local_path}")
    return local_path


def parse_corporate_filings(path: Path) -> pd.DataFrame:
    print(f"Parsing corporate filings: {path}")
    colspecs = [
        (0, 12),     # Corporation Number
        (12, 204),   # Corporation Name
        (204, 205),  # Status
        (205, 220),  # Filing Type
        (220, 262),  # Address 1
        (262, 304),  # Address 2
        (304, 332),  # City
        (332, 334),  # State
        (334, 344),  # Zip
        (344, 346),  # Country
        (472, 480),  # File Date (yyyymmdd)
        (480, 494),  # FEI Number
        (495, 503),  # Last Transaction Date
    ]
    names = [
        "doc_number", "corp_name", "status", "filing_type",
        "address1", "address2", "city", "state", "zip", "country",
        "file_date_raw", "fei_number", "last_transaction_date"
    ]
    
    df = pd.read_fwf(path, colspecs=colspecs, names=names, dtype=str, encoding="latin-1")
    df = df[df["status"] == "A"]
    
    if "file_date_raw" in df.columns:
        df["filing_date"] = pd.to_datetime(df["file_date_raw"], format="%m%d%Y", errors="coerce")
    
    return df


def parse_fed_lien_filings(path: Path) -> pd.DataFrame:
    print(f"Parsing federal lien filings: {path}")
    colspecs = [
        (0, 11),   # document number (no F prefix)
        (12, 20),  # filing date (MMDDYYYY format)
        (20, 50),  # lien type
        (50, 100), # additional info
    ]
    names = ["doc_number_raw", "filing_date_raw", "lien_type", "lien_info"]
    df = pd.read_fwf(path, colspecs=colspecs, names=names, dtype=str, encoding="latin-1")
    
    df["doc_number"] = "F" + df["doc_number_raw"].str.strip()
    
    if "filing_date_raw" in df.columns:
        df["filing_date"] = pd.to_datetime(df["filing_date_raw"], format="%m%d%Y", errors="coerce")
    
    return df


def parse_fed_lien_debtors(path: Path) -> pd.DataFrame:
    print(f"Parsing federal lien debtors: {path}")
    colspecs = [
        (0, 12),     # document number (F25FLR000326)
        (13, 68),    # debtor name (55 chars)
        (69, 149),   # address (80 chars)
        (149, 185),  # city (36 chars with padding)
        (185, 187),  # state (2 chars)
        (187, 196),  # zip (9 chars)
    ]
    names = ["doc_number", "debtor_name", "address", "city", "state", "zip"]
    df = pd.read_fwf(path, colspecs=colspecs, names=names, dtype=str, encoding="latin-1")
    
    for col in ["debtor_name", "address", "city", "state", "zip"]:
        if col in df.columns:
            df[col] = df[col].str.strip()
    
    return df


def calculate_hotness_score(row, source_type: str) -> int:
    score = 50
    
    if source_type == "fed_lien":
        score = 90
    elif source_type == "corp_new":
        score = 70
    
    if "filing_date" in row and pd.notna(row.get("filing_date")):
        try:
            days_old = (datetime.now() - row["filing_date"]).days
            if days_old <= 7:
                score += 10
            elif days_old <= 30:
                score += 5
            elif days_old > 90:
                score -= 10
        except:
            pass
    
    return min(100, max(0, score))


def score_mca_leads(corp_df, lien_filings_df, lien_debtors_df) -> pd.DataFrame:
    all_leads = []

    if corp_df is not None and not corp_df.empty:
        c = corp_df.copy()
        c["source"] = "corp_new"
        c["debtor_name"] = c["corp_name"]
        c["hotness_score"] = c.apply(lambda row: calculate_hotness_score(row, "corp_new"), axis=1)
        all_leads.append(c)

    if lien_debtors_df is not None and not lien_debtors_df.empty:
        d = lien_debtors_df.copy()
        if lien_filings_df is not None and not lien_filings_df.empty:
            f = lien_filings_df.copy()
            merged = d.merge(f, on="doc_number", how="left", suffixes=("", "_lien"))
        else:
            merged = d

        merged["source"] = "fed_lien"
        merged["hotness_score"] = merged.apply(lambda row: calculate_hotness_score(row, "fed_lien"), axis=1)
        all_leads.append(merged)

    if not all_leads:
        return pd.DataFrame()

    combined = pd.concat(all_leads, ignore_index=True)
    
    for col in ["debtor_name"]:
        if col in combined.columns:
            combined = combined[combined[col].notna() & (combined[col].str.strip() != "")]
    
    combined = combined.drop_duplicates(subset=["doc_number", "debtor_name"], keep="first")
    
    if "filing_date" in combined.columns:
        today = datetime.now()
        combined = combined[
            (combined["filing_date"].notna()) & 
            (combined["filing_date"] <= today) &
            (combined["filing_date"] >= today - pd.Timedelta(days=120))
        ]
        combined = combined.sort_values("filing_date", ascending=False)
    
    combined = combined.sort_values("hotness_score", ascending=False)

    return combined


def main():
    print("=" * 60)
    print("Florida MCA Lead Generator")
    print(f"Run date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    sftp, transport = connect_sftp()
    try:
        corp_remote = latest_daily_file(sftp, BASE_REMOTE_DIRS["corp_filings"], "c.txt")
        lien_remote = latest_daily_file(sftp, BASE_REMOTE_DIRS["fed_lien_filings"], "flrf.txt")
        lien_debtors_remote = latest_daily_file(sftp, BASE_REMOTE_DIRS["fed_lien_debtors"], "flrd.txt")

        corp_df = lien_df = lien_debtors_df = None

        if corp_remote:
            corp_path = download_remote_file(sftp, corp_remote)
            corp_df = parse_corporate_filings(corp_path)
            print(f"Corporate records parsed: {len(corp_df)}")
            human_pause(0.5, 1.5, label="processed corp")

        if lien_remote:
            lien_path = download_remote_file(sftp, lien_remote)
            lien_df = parse_fed_lien_filings(lien_path)
            print(f"Lien filing records parsed: {len(lien_df)}")
            human_pause(0.5, 1.5, label="processed lien filings")

        if lien_debtors_remote:
            lien_debtors_path = download_remote_file(sftp, lien_debtors_remote)
            lien_debtors_df = parse_fed_lien_debtors(lien_debtors_path)
            print(f"Lien debtor records parsed: {len(lien_debtors_df)}")
            human_pause(0.5, 1.5, label="processed lien debtors")

        print("\nScoring and combining leads...")
        leads = score_mca_leads(corp_df, lien_df, lien_debtors_df)
        
        if leads is not None and not leads.empty:
            output_cols = [
                "doc_number", "debtor_name", "address", "address1", "address2",
                "city", "state", "zip", "filing_date", "source", "hotness_score",
                "filing_type", "fei_number", "lien_type"
            ]
            available_cols = [c for c in output_cols if c in leads.columns]
            output_df = leads[available_cols]
            
            output_df.to_csv(OUTPUT_FILE, index=False)
            print(f"\nSaved {len(output_df)} Florida MCA leads to {OUTPUT_FILE}")
            
            print("\n" + "=" * 60)
            print("LEAD SUMMARY")
            print("=" * 60)
            if "source" in output_df.columns:
                print("Leads by Source:")
                print(output_df["source"].value_counts().to_string())
            print(f"\nHotness Score Stats:")
            print(f"  Average: {output_df['hotness_score'].mean():.1f}")
            print(f"  High (80+): {len(output_df[output_df['hotness_score'] >= 80])}")
            print(f"  Medium (50-79): {len(output_df[(output_df['hotness_score'] >= 50) & (output_df['hotness_score'] < 80)])}")
        else:
            print("No leads produced. Check source files.")

    finally:
        print("\nClosing SFTP connection...")
        sftp.close()
        transport.close()
        human_pause(0.3, 1.0, label="disconnected")

    print("\nDone!")


if __name__ == "__main__":
    main()
