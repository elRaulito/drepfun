import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from 'react';
import { BrowserWallet, Wallet, MeshTxBuilder, BlockfrostProvider, hashDrepAnchor } from "@meshsdk/core";

const ELRAULITO = 'drep_script1tu2ttdwdmvyrnhczd9segf5w7jr88qmdwam60szll5hnuyd8mz2';

const stripMarkdown = (text: string) =>
  text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim();

const TYPE_STYLES: Record<string, string> = {
  ParameterChange:     'bg-blue-500/20 text-blue-300 border-blue-500/40',
  HardForkInitiation:  'bg-orange-500/20 text-orange-300 border-orange-500/40',
  TreasuryWithdrawals: 'bg-green-500/20 text-green-300 border-green-500/40',
  NoConfidence:        'bg-red-500/20 text-red-300 border-red-500/40',
  UpdateCommittee:     'bg-purple-500/20 text-purple-300 border-purple-500/40',
  NewConstitution:     'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  InfoAction:          'bg-gray-500/20 text-gray-300 border-gray-500/40',
};

interface Proposal {
  tx_hash: string;
  cert_index: number;
  type: string;
  epoch_no: number | null;
  deposit: string;
}

interface Withdrawal { withdrawalAmount: number; withdrawalAddress: string; }

interface ProposalMeta {
  json_metadata?: {
    body?: {
      title?: string;
      abstract?: string;
      onChain?: { withdrawals?: Withdrawal[] };
    };
  };
}

function lovelaceToAda(lovelace: number): string {
  return 'â‚³â€‰' + (lovelace / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function proposalTotalWithdrawal(m: ProposalMeta | undefined): number {
  return (m?.json_metadata?.body?.onChain?.withdrawals ?? [])
    .reduce((s, w) => s + (w.withdrawalAmount ?? 0), 0);
}

interface DRepInfo {
  drep_id: string;
  active: boolean;
  registered: boolean;
}

interface VoteModal {
  proposal: Proposal;
  voteKind: 'Yes' | 'No' | 'Abstain';
}

export default function HomePage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [meta, setMeta] = useState<Record<string, ProposalMeta>>({});
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [drepInfo, setDrepInfo] = useState<DRepInfo | null>(null);
  const [drepId, setDrepId] = useState<string | null>(null);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [voteModal, setVoteModal] = useState<VoteModal | null>(null);
  const [rationale, setRationale] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  const [txHashes, setTxHashes] = useState<Record<string, string>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Load available wallets
  useEffect(() => {
    BrowserWallet.getAvailableWallets().then(setWallets).catch(() => {});
  }, []);

  // Load proposals then fetch metadata in batches
  useEffect(() => {
    fetch('/api/blockfrost/proposals')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) {
          setProposalError(`API error ${r.status}: ${data?.error ?? JSON.stringify(data)}`);
          return;
        }
        if (!Array.isArray(data)) {
          setProposalError(`Unexpected response: ${JSON.stringify(data)}`);
          return;
        }
        setProposals(data);

        const BATCH = 5;
        (async () => {
          for (let i = 0; i < data.length; i += BATCH) {
            const batch = data.slice(i, i + BATCH);
            await Promise.all(
              batch.map(async p => {
                const key = `${p.tx_hash}_${p.cert_index}`;
                try {
                  const r = await fetch(`/api/blockfrost/metadata?tx_hash=${p.tx_hash}&cert_index=${p.cert_index}`);
                  if (r.ok) {
                    const m = await r.json();
                    setMeta(prev => ({ ...prev, [key]: m }));
                  }
                } catch {}
              })
            );
          }
        })();
      })
      .catch(err => setProposalError(String(err)))
      .finally(() => setLoadingProposals(false));
  }, []);

  // Connect wallet and check DRep status
  const connect = async () => {
    if (!walletId) return;
    setConnectError(null);
    try {
      // CIP-95 extension enables getDRep()
      const w = await BrowserWallet.enable(walletId, [{ cip: 95 }]);
      setWallet(w);
      setIsConnected(true);

      try {
        const drepData = await (w as any).getDRep();
        const id: string | null = drepData?.dRepIDCip105 ?? drepData?.drepId ?? null;
        if (id) {
          setDrepId(id);
          const r = await fetch(`/api/blockfrost/drep?drep_id=${encodeURIComponent(id)}`);
          if (r.ok) setDrepInfo(await r.json());
        }
      } catch {
        // wallet doesn't expose DRep data â€” user is not a DRep or wallet lacks CIP-95
      }
    } catch (e: any) {
      setConnectError(e?.message ?? 'Connection failed');
    }
  };

  // Vote on a proposal with optional rationale uploaded to S3
  const submitVote = async () => {
    if (!wallet || !drepId || !voteModal) return;
    setIsVoting(true);

    const { proposal, voteKind } = voteModal;
    const key = `${proposal.tx_hash}_${proposal.cert_index}`;

    try {
      let anchor: { anchorUrl: string; anchorDataHash: string } | undefined;

      if (rationale.trim()) {
        const r = await fetch('/api/rationale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rationale: rationale.trim(),
            proposalTxHash: proposal.tx_hash,
            proposalCertIndex: proposal.cert_index,
            voteKind,
          }),
        });
        if (r.ok) {
          const { url, content } = await r.json();
          const hash = hashDrepAnchor(content);
          anchor = { anchorUrl: url, anchorDataHash: hash };
        }
        // if S3 not configured, silently continue without anchor
      }

      const provider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID!);
      const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: true });
      const changeAddress = await wallet.getChangeAddress();
      const utxos = await wallet.getUtxos();

      txBuilder
        .vote(
          { type: 'DRep', drepId },
          { txHash: proposal.tx_hash, txIndex: proposal.cert_index },
          { voteKind, ...(anchor ? { anchor } : {}) }
        )
        .selectUtxosFrom(utxos)
        .changeAddress(changeAddress);

      const unsignedTx = await txBuilder.complete();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      setTxHashes(prev => ({ ...prev, [key]: txHash }));
      setVoteModal(null);
      setRationale('');
    } catch (e: any) {
      alert('Vote failed: ' + (e?.message ?? String(e)));
    } finally {
      setIsVoting(false);
    }
  };

  const openModal = (proposal: Proposal, voteKind: VoteModal['voteKind']) => {
    setVoteModal({ proposal, voteKind });
    setRationale('');
  };

  const isDRep = isConnected && drepInfo?.active;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-purple-900 to-indigo-900 text-white" style={{ colorScheme: 'dark' }}>
      <Head>
        <title>DRep.fun â€” Governance Proposals</title>
        <meta name="description" content="Browse and vote on Cardano governance proposals as a DRep." />
      </Head>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/40 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">ðŸ­ DRep.fun</Link>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-green-300">Connected</span>
              {isDRep && (
                <span className="ml-1 bg-purple-500/40 border border-purple-400/40 px-2 py-0.5 rounded-full text-xs text-purple-200">
                  DRep âœ“
                </span>
              )}
            </div>
          ) : (
            <>
              <select
                value={walletId || ''}
                onChange={e => setWalletId(e.target.value)}
                className="bg-gray-900 text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
              >
                <option value="" className="bg-gray-900 text-white">Select wallet</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id} className="bg-gray-900 text-white">{w.name}</option>
                ))}
              </select>
              <button
                onClick={connect}
                disabled={!walletId}
                className="bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
              >
                Connect
              </button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold mb-1">Governance Proposals</h1>
        <p className="text-white/50 text-sm mb-8">
          {isDRep
            ? `Voting as DRep: ${drepId?.slice(0, 14)}â€¦${drepId?.slice(-6)}`
            : isConnected
            ? 'Wallet connected â€” not registered as an active DRep'
            : 'Connect your CIP-95 wallet to vote as a DRep'}
        </p>

        {connectError && (
          <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-3 mb-6 text-sm text-red-300">
            {connectError}
          </div>
        )}

        {/* Proposal list */}
        {loadingProposals ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-center text-white/40 py-20">
            {proposalError ? `Failed to load proposals: ${proposalError}` : 'No proposals found.'}
          </p>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => {
              const key = `${p.tx_hash}_${p.cert_index}`;
              const m = meta[key];
              const title = m?.json_metadata?.body?.title;
              const abstract = m?.json_metadata?.body?.abstract;
              const txHash = txHashes[key];
              const typeStyle = TYPE_STYLES[p.type] ?? TYPE_STYLES.InfoAction;

              return (
                <div
                  key={key}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.08] transition"
                >
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${typeStyle}`}>
                      {p.type}
                    </span>
                    {p.epoch_no && (
                      <span className="text-xs text-white/30">expires epoch {p.epoch_no}</span>
                    )}
                  </div>

                  <h2 className="font-semibold mb-1">
                    {title ? stripMarkdown(title) : `Untitled ${p.type} Proposal`}
                  </h2>

                  {abstract && (
                    <p className="text-white/70 text-sm mb-3 line-clamp-2">{stripMarkdown(abstract)}</p>
                  )}

                  <p className="text-white/20 text-xs font-mono mb-4 break-all">
                    {p.tx_hash}#{p.cert_index}
                  </p>

                  {txHash ? (
                    <div className="bg-green-500/15 border border-green-400/20 rounded-lg p-3 text-sm text-green-300">
                      âœ“ Vote submitted Â·{' '}
                      <a
                        href={`https://cardanoscan.io/transaction/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs underline opacity-70 hover:opacity-100"
                      >
                        {txHash.slice(0, 24)}â€¦
                      </a>
                    </div>
                  ) : isDRep ? (
                    <div className="flex gap-2">
                      {(['Yes', 'No', 'Abstain'] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => openModal(p, v)}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition hover:scale-[1.03] ${
                            v === 'Yes'
                              ? 'bg-green-500/20 border-green-500/40 text-green-300 hover:bg-green-500/35'
                              : v === 'No'
                              ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/35'
                              : 'bg-gray-500/20 border-gray-500/40 text-gray-300 hover:bg-gray-500/35'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/50">
                      {isConnected ? 'Not registered as an active DRep' : 'Connect wallet to vote'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Fixed: Delegate to ElRaulito */}
      <div className="fixed bottom-6 right-6 z-20">
        <button
          onClick={() => (window.location.href = `/${ELRAULITO}`)}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold py-3 px-5 rounded-full shadow-xl shadow-purple-900/60 transition-all hover:scale-105 text-sm"
        >
          ðŸ­ Delegate to ElRaulito
        </button>
      </div>

      {/* Vote modal */}
      {voteModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => e.target === e.currentTarget && setVoteModal(null)}
        >
          <div className="bg-[#1a0a2e] border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-1">Cast Your Vote</h2>
            <p className="text-white/40 text-xs font-mono mb-2 break-all">
              {voteModal.proposal.tx_hash}#{voteModal.proposal.cert_index}
            </p>
            {(() => {
              const total = proposalTotalWithdrawal(meta[`${voteModal.proposal.tx_hash}_${voteModal.proposal.cert_index}`]);
              return total > 0 ? (
                <p className="text-yellow-300 text-sm font-semibold mb-4">
                  Treasury withdrawal: {lovelaceToAda(total)}
                </p>
              ) : null;
            })()}

            {/* Vote kind selector */}
            <div className="flex gap-2 mb-5">
              {(['Yes', 'No', 'Abstain'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVoteModal({ ...voteModal, voteKind: v })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    voteModal.voteKind === v
                      ? v === 'Yes'
                        ? 'bg-green-500 border-green-400 text-white'
                        : v === 'No'
                        ? 'bg-red-500 border-red-400 text-white'
                        : 'bg-gray-600 border-gray-500 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Rationale */}
            <label className="block text-sm text-white/60 mb-2">
              Rationale{' '}
              <span className="text-white/30 text-xs">(optional â€” stored on S3, anchored to vote)</span>
            </label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              placeholder="Why are you voting this way?"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 resize-none mb-5 focus:outline-none focus:border-purple-400 transition"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setVoteModal(null)}
                className="flex-1 py-2 rounded-lg border border-white/15 text-white/50 text-sm hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitVote}
                disabled={isVoting}
                className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition"
              >
                {isVoting ? 'Submittingâ€¦' : `Vote ${voteModal.voteKind}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
