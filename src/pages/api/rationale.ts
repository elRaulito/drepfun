import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * General-purpose JSON-to-S3 uploader.
 * Used for both DRep metadata and vote rationale.
 *
 * Body params:
 *   - content    : the JSON object to store (required)
 *   - key        : S3 key/path override (optional, auto-generated if omitted)
 *   - prefix     : folder prefix in the bucket, e.g. "vote-rationale" or "drep-metadata" (default: "vote-rationale")
 *
 * Legacy vote-rationale shorthand (backward compat):
 *   - rationale, proposalTxHash, proposalCertIndex, voteKind
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const bucket = process.env.S3_BUCKET_NAME ?? 'drepdotfun';
  const region = process.env.AWS_REGION ?? 'eu-west-2';
  const baseUrl = process.env.S3_BASE_URL ?? 'https://drepdotfun.s3.eu-west-2.amazonaws.com';


  // Support two calling conventions
  let content: object;
  let s3Key: string;

  if (req.body.content) {
    // Generic mode: caller provides content and optional key/prefix
    content = req.body.content;
    const prefix: string = req.body.prefix ?? 'vote-rationale';
    s3Key = req.body.key ?? `${prefix}/${Date.now()}.jsonld`;
  } else if (req.body.rationale) {
    // Legacy shorthand for vote rationale
    const { rationale, proposalTxHash, proposalCertIndex, voteKind } = req.body;
    if (!rationale || !proposalTxHash || proposalCertIndex === undefined || !voteKind) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    content = {
      '@context': {
        '@language': 'en-us',
        CIP100: 'https://github.com/cardano-foundation/CIPs/blob/master/CIP-0100/README.md#',
        hashAlgorithm: 'CIP100:hashAlgorithm',
        body: {
          '@id': 'CIP100:body',
          '@context': { rationale: 'CIP100:rationale' },
        },
        authors: { '@id': 'CIP100:authors', '@container': '@set' },
      },
      hashAlgorithm: 'blake2b-256',
      body: {
        rationale,
        vote: voteKind,
        proposalId: `${proposalTxHash}#${proposalCertIndex}`,
      },
      authors: [],
    };
    s3Key = `vote-rationale/${proposalTxHash}_${proposalCertIndex}_${Date.now()}.jsonld`;
  } else {
    return res.status(400).json({ error: 'Provide either "content" or "rationale" in the request body' });
  }

  try {
    const s3 = new S3Client({ region });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: JSON.stringify(content, null, 2),
        ContentType: 'application/ld+json',
        ACL: 'public-read',
      })
    );

    res.json({ url: `${baseUrl}/${s3Key}`, content });
  } catch (err) {
    console.error('S3 upload failed:', err);
    res.status(500).json({ error: 'S3 upload failed' });
  }
}
