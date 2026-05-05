import type { NextApiRequest, NextApiResponse } from 'next';

const BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.BLOCKFROST_PROJECT_ID ?? process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID;
  if (!key) return res.status(500).json({ error: 'BLOCKFROST_PROJECT_ID not configured' });

  try {
    const all: unknown[] = [];
    let page = 1;
    while (true) {
      const r = await fetch(`${BASE}/governance/proposals?count=100&page=${page}&order=desc`, {
        headers: { project_id: key },
      });
      if (!r.ok) return res.status(r.status).json(await r.json());
      const batch: unknown[] = await r.json();
      all.push(...batch);
      if (batch.length < 100) break;
      page++;
      if (page > 5) break; // cap at 500 proposals
    }
    res.json(all);
  } catch {
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}
