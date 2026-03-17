# Seamless AI Research API - Phone Numbers Integration

## Overview

The new research flow has been integrated into the Seamless AI service. This allows you to get contacts with **phone numbers** by using the full research pipeline:

1. **Search** contacts by company name
2. **Create research requests** for those contacts
3. **Poll** until research is complete (this is where phone numbers come from)

## New API Endpoint

### Research Contacts with Phone Numbers

**POST** `/api/company-search/research-contacts`

**Request Body:**
```json
{
  "companyName": "HubSpot",
  "limit": 10
}
```

**Response:**
```json
{
  "success": true,
  "companyName": "HubSpot",
  "total": 5,
  "contacts": [
    {
      "name": "John Doe",
      "firstName": "John",
      "lastName": "Doe",
      "title": "CEO",
      "email": "john@hubspot.com",
      "phone": "+1-617-555-1234",  // ← Phone number from research!
      "company": "HubSpot",
      "companyCity": "Cambridge",
      "companyState": "Massachusetts",
      "domain": "hubspot.com",
      "linkedinUrl": "https://linkedin.com/in/johndoe"
    }
  ]
}
```

## Usage Examples

### Using cURL

```bash
curl -X POST http://localhost:5000/api/company-search/research-contacts \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Salesforce",
    "limit": 10
  }'
```

### Using JavaScript/Fetch

```javascript
const response = await fetch('http://localhost:5000/api/company-search/research-contacts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    companyName: 'HubSpot',
    limit: 10
  })
});

const data = await response.json();
console.log('Contacts with phone numbers:', data.contacts);
```

### Using Python

```python
import requests

response = requests.post(
    'http://localhost:5000/api/company-search/research-contacts',
    json={
        'companyName': 'HubSpot',
        'limit': 10
    }
)

data = response.json()
print(f"Found {data['total']} contacts with phone numbers")
for contact in data['contacts']:
    print(f"{contact['name']} - {contact['phone']}")
```

## How It Works

1. **Search Phase**: Searches for contacts matching the company name
2. **Research Phase**: Creates research requests for those contacts (this initiates phone number lookup)
3. **Polling Phase**: Polls the research API until contacts are ready with phone numbers
4. **Results**: Returns contacts with complete data including phone numbers

## Important Notes

- **Rate Limiting**: The API waits 5 seconds between research request chunks to respect rate limits
- **Polling**: The system polls up to 20 times (default) with 5-second intervals
- **Timeout**: If research doesn't complete within the polling window, partial results are returned
- **Phone Numbers**: Phone numbers are only available after the research phase completes

## Environment Variable

Make sure `SEAMLESS_API_KEY` is set:

```bash
export SEAMLESS_API_KEY="your_api_key_here"
```

Or in `.env` file:
```
SEAMLESS_API_KEY=your_api_key_here
```

## Comparison with Old Endpoint

### Old Endpoint (No Phone Numbers)
- **POST** `/api/company-search/enrich`
- Returns basic company info and executives
- **Phone numbers may be missing** (only from search results)

### New Endpoint (With Phone Numbers) ⭐
- **POST** `/api/company-search/research-contacts`
- Returns contacts with **guaranteed phone numbers** (from research)
- Uses the full research pipeline

## Testing

1. Start the server: `npm run dev`
2. Test the endpoint:
   ```bash
   curl -X POST http://localhost:5000/api/company-search/research-contacts \
     -H "Content-Type: application/json" \
     -d '{"companyName": "HubSpot", "limit": 5}'
   ```
3. Check the response for `phone` fields in contacts

## Integration Status

✅ **Completed:**
- Research request creation
- Polling mechanism
- Phone number extraction
- API endpoint
- Error handling
- Rate limiting

The Python script functionality has been fully integrated into the TypeScript service!


