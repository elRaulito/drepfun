import type { NextApiRequest, NextApiResponse } from 'next';

const BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';

// Returns the current on-chain UTXO holding the given asset
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.BLOCKFROST_PROJECT_ID ?? process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID ?? 'mainnet5JnwhqGoyF2CyTjns9IRXFrqysfJeQZl';


  const { asset } = req.query;
  if (!asset || typeof asset !== 'string') return res.status(400).json({ error: 'Missing asset' });

  try {
    // Step 1: find which address holds the asset
    const addrRes = await fetch(`${BASE}/assets/${asset}/addresses?count=1`, {
      headers: { project_id: key },
    });
    if (!addrRes.ok) return res.status(addrRes.status).json(await addrRes.json());
    const addrs: { address: string; quantity: string }[] = await addrRes.json();
    if (!addrs.length) return res.status(404).json({ error: 'Asset not found at any address' });

    const address = addrs[0].address;

    // Step 2: find the UTXO at that address containing the asset
    const utxoRes = await fetch(`${BASE}/addresses/${address}/utxos/${asset}?count=1`, {
      headers: { project_id: key },
    });
    if (!utxoRes.ok) return res.status(utxoRes.status).json(await utxoRes.json());
    const utxos: { tx_hash: string; tx_index: number }[] = await utxoRes.json();
    if (!utxos.length) return res.status(404).json({ error: 'No UTXO found for asset' });

    res.json({ tx_hash: utxos[0].tx_hash, tx_index: utxos[0].tx_index });
  } catch {
    res.status(500).json({ error: 'Failed to look up NFT UTXO' });
  }
}
