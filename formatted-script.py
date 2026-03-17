import requests
import json
import sys
import time

BASE_URL = "https://api.seamless.ai/api/client/v1"


def chunk_list(data, size=10):
    for i in range(0, len(data), size):
        yield data[i:i + size]

def search_contacts(api_key, company_name):
    headers = {
        "Token": api_key,
        "Content-Type": "application/json"
    }

    search_url = f"{BASE_URL}/search/contacts"

    payload = {
        "companyName": [company_name],
        "limit": 10,
        "page": 1
    }

    print(f"\n🔍 Searching contacts for: {company_name}")
    response = requests.post(search_url, headers=headers, json=payload, timeout=15)

    if response.status_code != 200:
        print(f"❌ Search failed: {response.status_code}")
        print(response.text)
        sys.exit(1)

    data = response.json()
    print(data)

    if not data.get("data"):
        print("❌ No results found.")
        sys.exit(0)

    search_result_ids = [item.get("searchResultId") for item in data["data"] if item.get("searchResultId")]

    print(f"✅ Found {len(search_result_ids)} search result IDs")
    return search_result_ids

def create_research_requests(api_key, search_result_ids):
    headers = {
        "Token": api_key,
        "Content-Type": "application/json"
    }

    research_url = f"{BASE_URL}/contacts/research"
    research_ids = []

    for chunk in chunk_list(search_result_ids, 10):
        payload = {"searchResultIds": chunk}

        print(f"\n📤 Creating research for chunk of {len(chunk)} IDs")

        response = requests.post(research_url, headers=headers, json=payload, timeout=15)

        if response.status_code != 202:
            print(f"❌ Research request failed: {response.status_code}")
            print(response.text)
            continue

        result = response.json()

        if result.get("requestIds"):
            research_ids.extend(result["requestIds"])
            print(f"✅ Research IDs received: {result['requestIds']}")
        else:
            print("⚠️ Unexpected research response:")
            print(json.dumps(result, indent=2))

        time.sleep(5)

    return research_ids

def poll_research(api_key, research_ids, interval=5, max_attempts=20):
    """
    Poll research results until:
    - contact is present
    - OR status contains 'error'
    """

    headers = {
        "Token": api_key,
        "Content-Type": "application/json"
    }

    poll_url = f"{BASE_URL}/contacts/research/poll"

    remaining_ids = set(research_ids)
    completed_results = []

    attempt = 0

    while remaining_ids and attempt < max_attempts:
        attempt += 1
        print(f"\n⏳ Poll attempt {attempt} - Remaining: {len(remaining_ids)}")


        # send remaining ids in query string
        query_string = ",".join(remaining_ids)
        response = requests.get(f"{poll_url}?requestIds={query_string}", headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"❌ Poll failed: {response.status_code}")
            print(response.text)
            return

        result = response.json()

        if not result.get("success"):
            print("❌ Poll response unsuccessful")
            print(json.dumps(result, indent=2))
            return

        for item in result.get("data", []):
            request_id = item.get("requestId")
            status = (item.get("status") or "").lower()
            contact = item.get("contact")

            # Case 1: Error occurred
            if "error" in status:
                print(f"❌ Error for {request_id}: {item.get('message')}")
                remaining_ids.discard(request_id)
                continue
            
            if "duplicate" in status:
                remaining_ids.discard(request_id)
                additional_data = item.get("additionalData", {})
                # try to get the initialRequestId from additional data
                initial_request_id = additional_data.get("initialRequestId")
                # if it exists, add it to remaining ids to poll for the correct result
                if initial_request_id:
                    print(f"🔄 Duplicate for {request_id}, will poll for initial request ID: {initial_request_id}")
                    remaining_ids.add(initial_request_id)
                else:
                    print(f"⚠️ Duplicate for {request_id}: {additional_data}")
                continue

            # Case 2: Completed successfully
            if contact:
                print(f"✅ Completed: {request_id}")
                completed_results.append(contact)
                remaining_ids.discard(request_id)
                continue

            # Case 3: Still processing
            print(f"⌛ Still processing: {request_id} (status: {status})")

        if remaining_ids:
            time.sleep(interval)

    if remaining_ids:
        print("\n⚠️ Polling stopped before all jobs completed.")
        print(f"Remaining unfinished IDs: {remaining_ids}")

    print(f"\n🎉 Completed {len(completed_results)} research results")
    return completed_results

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:")
        print(" python3 seamless_api.py YOUR_API_KEY 'Company Name'")
        sys.exit(1)

    api_key = sys.argv[1]
    company_name = " ".join(sys.argv[2:])

    # Step 1: Search
    ids = search_contacts(api_key, company_name)

    # Step 2: Create Research Jobs
    research_ids = create_research_requests(api_key, ids)

    print("\n🚀 Research jobs created.")
    print("Research IDs:", research_ids)

    # Step 3: Smart Polling
    results = poll_research(api_key, research_ids)

    # Step 4: Write to file with timestamp
    file_name = f"research_results_{int(time.time())}.json"
    with open(file_name, "w") as f:
        json.dump(results, f, indent=2)

    print("\n📦 Final Contact Results:")
    print(json.dumps(results, indent=2))
