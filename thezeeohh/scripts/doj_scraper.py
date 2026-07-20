#!/usr/bin/env python3
"""
C.I.R.N. Subpoena Scraper - CourtListener API Integration
Queries the CourtListener v4 Search API for DOJ administrative subpoenas
issued to state Departments of Corrections and logs them to the local Express backend.
"""

import sys
import os
import json
import requests

BACKEND_URL = os.environ.get("IRN_BACKEND_URL", "http://localhost:3001/api/subpoenas/dockets")
COURTLISTENER_TOKEN = os.environ.get("COURTLISTENER_API_TOKEN")

def scrape_courtlistener(api_token: str) -> list:
    """
    Queries CourtListener Search API for DOJ administrative subpoena RECAP dockets.
    """
    url = "https://www.courtlistener.com/api/rest/v4/search/"
    query = '"Department of Justice" AND "Administrative Subpoena" AND "Department of Corrections"'
    
    headers = {
        "Authorization": f"Token {api_token}",
        "Accept": "application/json"
    }
    params = {
        "q": query,
        "type": "r"  # RECAP dockets only
    }
    
    print(f"[*] Querying CourtListener search endpoint for dockets matching pattern...")
    try:
        res = requests.get(url, headers=headers, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        results = data.get("results", [])
        extracted = []
        for r in results:
            # Try to resolve state jurisdiction from court ID (e.g. mnd = MN, me = ME)
            court_id = r.get("court_id", "")
            state = "US"
            if court_id:
                # Basic heuristic extraction
                state_candidate = court_id[1:3].upper() if court_id.startswith("d") else court_id[:2].upper()
                # Clean up if not standard 2 letter code
                state = state_candidate if len(state_candidate) == 2 else "ME"

            extracted.append({
                "docket_id": str(r.get("id")),
                "case_name": r.get("caseName") or "Unknown DOJ Subpoena Case",
                "docket_number": r.get("docketNumber") or "N/A",
                "court": r.get("court_id") or "Federal Court",
                "state_jurisdiction": state,
                "date_filed": r.get("dateFiled") or None,
                "url": f"https://www.courtlistener.com{r.get('absolute_url')}" if r.get("absolute_url") else None
            })
        return extracted
    except Exception as e:
        print(f"[!] CourtListener query failed: {e}")
        return []

def log_to_backend(dockets: list):
    """
    POSTs discovered dockets to the IRN local Express server API.
    """
    print(f"[*] Pushing {len(dockets)} dockets to IRN local server at: {BACKEND_URL}")
    for doc in dockets:
        try:
            res = requests.post(BACKEND_URL, json=doc, timeout=5)
            if res.status_code == 200:
                print(f"[+] Successfully logged docket: {doc['case_name']} ({doc['docket_number']})")
            else:
                print(f"[!] Backend rejected docket {doc['docket_id']}: {res.text}")
        except Exception as e:
            print(f"[!] Connection to backend failed: {e}")

def load_mock_dockets() -> list:
    """
    Loads mock DOJ subpoena dockets to demonstrate functionality if no API token is available.
    """
    return [
        {
            "docket_id": "ME-2026-104",
            "case_name": "U.S. Department of Justice v. Maine Department of Corrections",
            "docket_number": "2:26-cv-00104",
            "court": "U.S. District Court for the District of Maine",
            "state_jurisdiction": "ME",
            "date_filed": "2026-03-12",
            "url": "https://www.courtlistener.com/docket/68291024/us-v-maine-doc/"
        },
        {
            "docket_id": "MD-2026-452",
            "case_name": "In Re: Subpoena to Maryland Department of Public Safety",
            "docket_number": "1:26-cv-01452",
            "court": "U.S. District Court for the District of Maryland",
            "state_jurisdiction": "MD",
            "date_filed": "2026-04-18",
            "url": "https://www.courtlistener.com/docket/68341029/in-re-subpoena-md-doc/"
        },
        {
            "docket_id": "VA-2026-881",
            "case_name": "United States v. Virginia Department of Corrections",
            "docket_number": "3:26-mc-00881",
            "court": "U.S. District Court for the Eastern District of Virginia",
            "state_jurisdiction": "VA",
            "date_filed": "2026-06-01",
            "url": "https://www.courtlistener.com/docket/68401882/us-v-va-doc/"
        }
    ]

def main():
    if not COURTLISTENER_TOKEN or COURTLISTENER_TOKEN == "YOUR_COURTLISTENER_API_TOKEN":
        print("[!] No COURTLISTENER_API_TOKEN environment variable found.")
        print("[*] Running in mock/demonstration mode...")
        dockets = load_mock_dockets()
    else:
        dockets = scrape_courtlistener(COURTLISTENER_TOKEN)
        
    if dockets:
        log_to_backend(dockets)
    else:
        print("[!] No records gathered or scraping failed.")

if __name__ == "__main__":
    main()
