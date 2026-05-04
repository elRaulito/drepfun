import type { NextApiRequest, NextApiResponse } from 'next';

const BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';

// ── CIP-0129 bech32 encoder ───────────────────────────────────────────────────
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const r: number[] = [];
  for (const c of hrp) r.push(c.charCodeAt(0) >> 5);
  r.push(0);
  for (const c of hrp) r.push(c.charCodeAt(0) & 31);
  return r;
}

function to5bit(bytes: Buffer): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffffffff;
    bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

function govActionId(txHash: string, certIndex: number): string {
  const payload = Buffer.concat([Buffer.from(txHash, 'hex'), Buffer.from([certIndex])]);
  const words = to5bit(payload);
  const hrp = 'gov_action';
  const chk = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksumWords = Array.from({ length: 6 }, (_, i) => (chk >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...words, ...checksumWords].map(x => CHARSET[x]).join('');
}
// ─────────────────────────────────────────────────────────────────────────────

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
];

function resolveUrl(url: string): string[] {
  if (url.startsWith('ipfs://')) {
    const cid = url.slice(7);
    return IPFS_GATEWAYS.map(gw => gw + cid);
  }
  return [url];
}

// Fetch metadata from the source URL directly (fallback when Blockfrost reports hash mismatch).
// Handles both https:// and ipfs:// URLs, trying multiple gateways for IPFS.
async function fetchFromUrl(url: string): Promise<object | null> {
  for (const resolved of resolveUrl(url)) {
    try {
      const r = await fetch(resolved, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const text = await r.text();
      return JSON.parse(text);
    } catch {
      continue;
    }
  }
  return null;
}

// Try a Blockfrost metadata endpoint; if it succeeds but json_metadata is null,
// attempt to fetch from the url field directly.
async function tryEndpoint(url: string, headers: Record<string, string>): Promise<object | null> {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const data = await r.json();

    if (data.json_metadata !== null && data.json_metadata !== undefined) return data;

    // json_metadata null but url present — fetch directly
    if (data.url) {
      const direct = await fetchFromUrl(data.url);
      if (direct) return { ...data, json_metadata: direct };
    }

    return data; // return as-is even if still null
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.BLOCKFROST_PROJECT_ID;
  if (!key) return res.status(500).json({ error: 'BLOCKFROST_PROJECT_ID not configured' });

  const { tx_hash, cert_index } = req.query;
  if (!tx_hash || cert_index === undefined) return res.status(400).json({ error: 'Missing tx_hash or cert_index' });

  const headers = { project_id: key };

  // 1. Classic tx_hash / cert_index path
  const primary = await tryEndpoint(
    `${BASE}/governance/proposals/${tx_hash}/${cert_index}/metadata`,
    headers
  );
  if (primary) return res.json(primary);

  // 2. CIP-0129 gov_action_id path
  const gaid = govActionId(tx_hash as string, Number(cert_index));
  const fallback = await tryEndpoint(
    `${BASE}/governance/proposals/${gaid}/metadata`,
    headers
  );
  if (fallback) return res.json(fallback);

  return res.status(404).json({ error: 'Metadata not found' });
}
