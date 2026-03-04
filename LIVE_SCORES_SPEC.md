# Live Scores Feature Spec

## Overview
Add live tennis scores to the ACE Framework tracker pick cards using the Bet365 RapidAPI.

## API Details
- **Host:** bet36528.p.rapidapi.com
- **Key:** dd220b6e71msh1a11f68c7d10d77p1449efjsn1300ea1118d9
- **Key endpoints:**
  - `GET /sports` → list sports (tennis = sportId 12)
  - `GET /tournaments?sportId=12` → list tournaments with liveFixtures count
  - `GET /fixtures?tournamentId={id}` → list fixtures (statusId 1=live, 2=finished, 3=upcoming)
  - `GET /scores?fixtureId={id}` → live scores with set-by-set data
  - `GET /participants?sportId=12&query={name}` → search players (returns {id: "Name, First"} map)

## Score Data Structure
```json
{
  "fixtureId": "id1200273969520530",
  "scores": {
    "periods": {
      "result": { "participant1Score": 1, "participant2Score": 0 },
      "p1": { "participant1Score": 6, "participant2Score": 2 },
      "p2": { "participant1Score": 6, "participant2Score": 6 },
      "p3": { "participant1Score": 0, "participant2Score": 0 }
    }
  }
}
```
- `result` = sets won
- `p1`, `p2`, `p3` = games per set

## Architecture
1. **Vercel serverless function** at `/api/scores.js` — proxies API calls (keeps key server-side)
   - Accepts POST with array of player last names from PENDING
   - Finds active tournaments with live fixtures
   - Matches fixtures to player names using participant search
   - Returns scores for matched fixtures
2. **Client-side JS** — polls `/api/scores` every 45 seconds while PENDING has entries
   - Renders live score badges on the pick cards
   - Shows set scores (e.g., "6-2 4-3*") with serving indicator if available

## Vercel Serverless Function (`/api/scores.js`)
The function should:
1. Accept a POST body with `{ players: ["Galarneau", "Buse", "Prizmic", ...] }`
2. Call `/tournaments?sportId=12` to find tournaments with liveFixtures > 0
3. For each active tournament, call `/fixtures?tournamentId={id}` to get live fixtures (statusId=1)
4. For each live fixture, resolve participant IDs to names using a cached `/participants?sportId=12&query={lastName}` call
5. Match fixtures to requested players by last name
6. For matched fixtures, call `/scores?fixtureId={id}` to get live scores
7. Return array of `{ player, opponent, sets: [{p1: 6, p2: 2}, ...], status: "live"|"finished", serving: 1|2|null }`

## Client-side Integration
In `renderPending()`:
- After rendering cards, start polling `/api/scores` every 45 seconds
- For each returned score, find the matching card and inject a score badge
- Score badge format: `6-2 4-3*` (asterisk = currently in this set)
- Use green for winning, red for losing

## API Key
Store in Vercel env var `RAPIDAPI_KEY` (already in .env.local):
dd220b6e71msh1a11f68c7d10d77p1449efjsn1300ea1118d9

## Files to create/modify
1. CREATE `/api/scores.js` — Vercel serverless function
2. MODIFY `index.html` — add polling + score rendering in renderPending
3. MODIFY `vercel.json` — add API route if needed (Vercel auto-detects /api folder)

## Constraints
- Free tier: be mindful of rate limits
- Cache tournament/participant data for 5 minutes
- Only poll when PENDING array is non-empty
- Graceful degradation: if API fails, cards render normally without scores
