import subprocess
import sys
from datetime import datetime

print("=" * 60)
print("MCA Lead Generator - Daily Run")
print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 60)

print("\n[1/2] Running Colorado UCC Pipeline...")
result1 = subprocess.run([sys.executable, "main.py"], capture_output=False)
if result1.returncode != 0:
    print("Colorado pipeline failed!")

print("\n[2/2] Running Florida Pipeline...")
result2 = subprocess.run([sys.executable, "florida_pipeline.py"], capture_output=False)
if result2.returncode != 0:
    print("Florida pipeline failed!")

print("\n" + "=" * 60)
print("All pipelines complete!")
print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 60)
