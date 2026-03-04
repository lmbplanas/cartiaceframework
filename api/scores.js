const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = 'bet36528.p.rapidapi.com';

async function apiFetch(path, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(`https://${API_HOST}${path}`, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': API_HOST,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 && i < retries) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // wait 1s, 2s
      continue;
    }
    throw new Error(`API ${path}: ${res.status}`);
  }
}

const cache = {};
function cached(key, ttlMs, fn) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < ttlMs) return Promise.resolve(entry.data);
  return fn().then(data => { cache[key] = { data, ts: Date.now() }; return data; });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { players } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!players || !players.length) return res.status(400).json({ error: 'players array required' });

    const tournaments = await cached('tournaments', 120000, () => apiFetch('/tournaments?sportId=12'));
    const activeTournaments = tournaments.filter(t => t.liveFixtures > 0);
    if (!activeTournaments.length) return res.json({ matches: [] });

    const allLiveFixtures = [];
    for (const t of activeTournaments) {
      const fixtures = await cached(`fix_${t.tournamentId}`, 30000, () =>
        apiFetch(`/fixtures?tournamentId=${t.tournamentId}`)
      );
      fixtures.filter(f => f.statusId === 1).forEach(f => {
        f._tournament = t.tournamentName;
        allLiveFixtures.push(f);
      });
    }
    if (!allLiveFixtures.length) return res.json({ matches: [] });

    const participantIds = new Set();
    allLiveFixtures.forEach(f => { participantIds.add(f.participant1Id); participantIds.add(f.participant2Id); });

    const idToName = {};
    for (const playerName of players) {
      const lastName = playerName.split(' ').pop();
      const data = await cached(`part_${lastName}`, 300000, () =>
        apiFetch(`/participants?sportId=12&query=${encodeURIComponent(lastName)}`)
      );
      for (const [id, name] of Object.entries(data)) {
        const numId = parseInt(id);
        if (participantIds.has(numId)) idToName[numId] = name;
      }
    }

    const results = [];
    for (const fixture of allLiveFixtures) {
      const p1Name = idToName[fixture.participant1Id];
      const p2Name = idToName[fixture.participant2Id];
      if (!p1Name && !p2Name) continue;

      const matchedPlayer = players.find(p => {
        const ln = p.split(' ').pop().toLowerCase();
        return (p1Name && p1Name.toLowerCase().includes(ln)) || (p2Name && p2Name.toLowerCase().includes(ln));
      });
      if (!matchedPlayer) continue;

      let scores = null;
      try {
        scores = await cached(`sc_${fixture.fixtureId}`, 20000, () =>
          apiFetch(`/scores?fixtureId=${fixture.fixtureId}`)
        );
      } catch (e) {}

      const sets = [];
      if (scores?.scores?.periods) {
        for (let i = 1; i <= 5; i++) {
          const p = scores.scores.periods[`p${i}`];
          if (p) sets.push({ p1: p.participant1Score, p2: p.participant2Score });
        }
      }
      const setsWon = scores?.scores?.periods?.result || {};

      results.push({
        player: matchedPlayer,
        p1Name: p1Name || `ID:${fixture.participant1Id}`,
        p2Name: p2Name || `ID:${fixture.participant2Id}`,
        p1Id: fixture.participant1Id,
        p2Id: fixture.participant2Id,
        tournament: fixture._tournament,
        sets,
        setsWon: { p1: setsWon.participant1Score || 0, p2: setsWon.participant2Score || 0 },
        status: 'live',
        fixtureId: fixture.fixtureId,
      });
    }

    return res.json({ matches: results, live: allLiveFixtures.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
