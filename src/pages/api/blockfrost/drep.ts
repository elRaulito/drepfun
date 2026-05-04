import type { NextApiRequest, NextApiResponse } from 'next';

const BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.BLOCKFROST_PROJECT_ID;
  if (!key) return res.status(500).json({ error: 'BLOCKFROST_PROJECT_ID not configured' });

  const { drep_id } = req.query;
  if (!drep_id) return res.status(400).json({ error: 'Missing drep_id' });

  try {
    const r = await fetch(`${BASE}/governance/dreps/${drep_id}`, {
      headers: { project_id: key },
    });
    if (!r.ok) return res.status(r.status).json(await r.json());
    res.json(await r.json());
  } catch {
    res.status(500).json({ error: 'Failed to fetch DRep info' });
  }
}
