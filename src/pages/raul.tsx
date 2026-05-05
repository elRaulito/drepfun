import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from 'react';
import {
  BrowserWallet,
  Wallet,
  MeshTxBuilder,
  BlockfrostProvider,
  hashDrepAnchor,
  resolveScriptHashDRepId,
  resolveStakeKeyHash,
  mConStr0,
  keepRelevant,
} from "@meshsdk/core";
import cbor from "cbor";

// Script DRep configuration
const SCRIPT_HASH = "5f14b5b5cddb0839df02696194268ef48673836d7777a7c05ffd2f3e";
const REQUIRED_SIGNER = "fd3a6bfce30d7744ac55e9cf9146d8a2a04ec7fb2ce2ee6986260653";
// NFT that the voting script checks for — UTXO is looked up dynamically at vote time
const AUTH_NFT_ASSET = "4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f000de14042756438383632";

const VOTING_SCRIPT_RAW =
  "5902f00101003232323232323225333002323232323232323232323232533300e3370e900300389919191802007180a980b0011bad3014001301037540102a66601c66e1d2008007132300200c3013301037540102a66601c66e1d200a0071323232300400e30153016002375a602800260206ea8020588c94ccc03cc01cc040dd5000899192999808980498091baa0011325333012300a30133754002264a666026601660286ea80044c94ccc050c8c004c94ccc058c008c05cdd50008a400026eb4c06cc060dd500099299980b1801180b9baa00114c0103d87a8000132330010013756603860326ea8008894ccc06c004530103d87a8000132323232533301c337229110b000de14042756438383632000021533301c3371e91010b000de14042756438383632000021301333020375000297ae014c0103d87a8000133006006003375a603a0066eb8c06c008c07c008c074004c8cc004004dd59805180c1baa300a3018375400e44a666034002298103d87a8000132323232533301b337229111c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f000021533301b3371e91011c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f00002130123301f374c00297ae014c0103d87a8000133006006003375660380066eb8c068008c078008c070004dc3a4004264660020026eb0c068c06cc06cc06cc06cc06cc06cc06cc06cc05cdd500411299980c8008a5013253330173371e6eb8c070008010528899801801800980e0008a50375c6030602a6ea800458c05cc050dd50008b180b18099baa00116300430123754602a60246ea8c010c048dd5000980a18089baa00116330033758600460206ea800520002301230130013001001222533301000214c0103d87a800013232533300f300700313006330130024bd70099980280280099b8000348004c05000cc048008dd2a40006e1d2000300837540026016601800460140026014004601000260086ea8004526136565734aae7555cf2ab9f5740ae855d101";

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
  return '₳ ' + (lovelace / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function proposalTotalWithdrawal(m: ProposalMeta | undefined): number {
  return (m?.json_metadata?.body?.onChain?.withdrawals ?? [])
    .reduce((s, w) => s + (w.withdrawalAmount ?? 0), 0);
}

interface VoteModal {
  proposal: Proposal;
  voteKind: 'Yes' | 'No' | 'Abstain';
}

export default function RaulPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [meta, setMeta] = useState<Record<string, ProposalMeta>>({});
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [voteModal, setVoteModal] = useState<VoteModal | null>(null);
  const [rationale, setRationale] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  const [txHashes, setTxHashes] = useState<Record<string, string>>({});
  const [selectedVotes, setSelectedVotes] = useState<Map<string, 'Yes' | 'No' | 'Abstain'>>(new Map());
  const [isBatchVoting, setIsBatchVoting] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchRationale, setBatchRationale] = useState('');

  const drepId = resolveScriptHashDRepId(SCRIPT_HASH);
  const rightScript = cbor
    .encode(Buffer.from(VOTING_SCRIPT_RAW, 'hex'))
    .toString('hex');

  useEffect(() => {
    BrowserWallet.getAvailableWallets().then(setWallets).catch(() => {});
  }, []);

  // Auto-connect if a previously-authorised wallet belongs to the admin
  useEffect(() => {
    const tryAutoConnect = async () => {
      let available: Wallet[] = [];
      try { available = await BrowserWallet.getAvailableWallets(); } catch { return; }

      for (const w of available) {
        try {
          const candidate = await BrowserWallet.enable(w.id);
          const stakeAddrs = await candidate.getRewardAddresses();
          const isAdmin = stakeAddrs.some(addr => {
            try { return resolveStakeKeyHash(addr) === REQUIRED_SIGNER; } catch { return false; }
          });
          if (isAdmin) {
            setWallet(candidate);
            setWalletId(w.id);
            setIsConnected(true);
            return;
          }
        } catch {
          // wallet not yet authorised for this site — skip silently
        }
      }
    };
    tryAutoConnect();
  }, []);

  useEffect(() => {
    fetch('/api/blockfrost/proposals')
      .then(r => r.json())
      .then((data: Proposal[]) => {
        if (!Array.isArray(data)) return;
        setProposals(data);
        const BATCH = 5;
        (async () => {
          for (let i = 0; i < data.length; i += BATCH) {
            const slice = data.slice(i, i + BATCH);
            await Promise.all(
              slice.map(async p => {
                const key = `${p.tx_hash}_${p.cert_index}`;
                try {
                  const r = await fetch(`/api/blockfrost/metadata?tx_hash=${p.tx_hash}&cert_index=${p.cert_index}`);
                  if (r.ok) { const m = await r.json(); setMeta(prev => ({ ...prev, [key]: m })); }
                } catch {}
              })
            );
          }
        })();
      })
      .catch(() => {})
      .finally(() => setLoadingProposals(false));
  }, []);

  const connect = async () => {
    if (!walletId) return;
    try {
      const w = await BrowserWallet.enable(walletId);
      setWallet(w);
      setIsConnected(true);
    } catch (e: any) {
      alert('Wallet connection failed: ' + (e?.message ?? String(e)));
    }
  };

  // Build and submit vote transaction for one or many proposals using the Plutus script.
  // Each govAction carries its own voteKind so batch votes can differ per proposal.
  const buildVoteTx = async (
    govActions: { tx_hash: string; cert_index: number; voteKind: 'Yes' | 'No' | 'Abstain' }[],
    anchor?: { anchorUrl: string; anchorDataHash: string }
  ) => {
    if (!wallet) throw new Error('Wallet not connected');

    // Dynamically look up the current UTXO holding the auth NFT
    const nftRes = await fetch(`/api/blockfrost/nft-utxo?asset=${AUTH_NFT_ASSET}`);
    if (!nftRes.ok) throw new Error('Could not find auth NFT UTXO — check Blockfrost config');
    const { tx_hash: nftTxHash, tx_index: nftTxIndex } = await nftRes.json();

    const provider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID!);
    const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: true });
    const changeAddress = await wallet.getChangeAddress();
    const utxos = await wallet.getUtxos();
    const collateral = await wallet.getCollateral();

    const assetMap = new Map<string, string>();
    assetMap.set('lovelace', '5000000');
    const selectedUtxos = keepRelevant(assetMap, utxos);

    txBuilder
      .txInCollateral(
        collateral[0]!.input.txHash,
        collateral[0]!.input.outputIndex,
        collateral[0]!.output.amount,
        collateral[0]!.output.address
      )
      .setNetwork('mainnet');

    for (const ga of govActions) {
      txBuilder
        .votePlutusScriptV3()
        .vote(
          { type: 'DRep', drepId },
          { txHash: ga.tx_hash, txIndex: ga.cert_index },
          { voteKind: ga.voteKind, ...(anchor ? { anchor } : {}) }
        )
        .voteScript(rightScript)
        .voteRedeemerValue(mConStr0([]), 'Mesh', { mem: 200000, steps: 50000000 });
    }

    txBuilder
      .requiredSignerHash(REQUIRED_SIGNER)
      .readOnlyTxInReference(nftTxHash, nftTxIndex)
      .changeAddress(changeAddress)
      .selectUtxosFrom(selectedUtxos);

    const unsignedTx = await txBuilder.complete();
    const signedTx = await wallet.signTx(unsignedTx, true);
    return wallet.submitTx(signedTx);
  };

  // Upload rationale to S3, return anchor
  const uploadRationale = async (
    text: string,
    proposalTxHash: string,
    proposalCertIndex: number,
    voteKind: string
  ): Promise<{ anchorUrl: string; anchorDataHash: string } | undefined> => {
    if (!text.trim()) return undefined;
    try {
      const r = await fetch('/api/rationale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rationale: text.trim(), proposalTxHash, proposalCertIndex, voteKind }),
      });
      if (!r.ok) return undefined;
      const { url, content } = await r.json();
      return { anchorUrl: url, anchorDataHash: hashDrepAnchor(content) };
    } catch {
      return undefined;
    }
  };

  // Single proposal vote (with modal)
  const submitVote = async () => {
    if (!voteModal) return;
    setIsVoting(true);
    try {
      const { proposal, voteKind } = voteModal;
      const anchor = await uploadRationale(rationale, proposal.tx_hash, proposal.cert_index, voteKind);
      const txHash = await buildVoteTx([{ ...proposal, voteKind }], anchor);
      setTxHashes(prev => ({ ...prev, [`${proposal.tx_hash}_${proposal.cert_index}`]: txHash }));
      setVoteModal(null);
      setRationale('');
    } catch (e: any) {
      alert('Vote failed: ' + (e?.message ?? String(e)));
    } finally {
      setIsVoting(false);
    }
  };

  // Batch vote — each proposal uses its individually selected vote kind
  // rationale is uploaded once and the same anchor is attached to all votes
  const submitBatchVote = async () => {
    if (selectedVotes.size === 0) return;
    setIsBatchVoting(true);
    setShowBatchModal(false);
    try {
      const govActions = proposals
        .filter(p => selectedVotes.has(`${p.tx_hash}_${p.cert_index}`))
        .map(p => ({
          tx_hash: p.tx_hash,
          cert_index: p.cert_index,
          voteKind: selectedVotes.get(`${p.tx_hash}_${p.cert_index}`)!,
        }));

      // Upload one rationale document covering all proposals in this batch
      let anchor: { anchorUrl: string; anchorDataHash: string } | undefined;
      if (batchRationale.trim()) {
        anchor = await uploadRationale(
          batchRationale.trim(),
          govActions[0].tx_hash,
          govActions[0].cert_index,
          `batch:${govActions.map(g => `${g.tx_hash}#${g.cert_index}:${g.voteKind}`).join(',')}`
        );
      }

      const txHash = await buildVoteTx(govActions, anchor);
      const updates: Record<string, string> = {};
      govActions.forEach(ga => { updates[`${ga.tx_hash}_${ga.cert_index}`] = txHash; });
      setTxHashes(prev => ({ ...prev, ...updates }));
      setSelectedVotes(new Map());
      setBatchRationale('');
    } catch (e: any) {
      alert('Batch vote failed: ' + (e?.message ?? String(e)));
    } finally {
      setIsBatchVoting(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedVotes(prev => {
      const next = new Map(prev);
      next.has(key) ? next.delete(key) : next.set(key, 'Yes');
      return next;
    });
  };

  const setProposalVote = (key: string, voteKind: 'Yes' | 'No' | 'Abstain') => {
    setSelectedVotes(prev => new Map(prev).set(key, voteKind));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-purple-900 to-indigo-900 text-white" style={{ colorScheme: 'dark' }}>
      <Head>
        <title>DRep.fun — Admin Vote</title>
        <meta name="description" content="ElRaulito admin voting panel." />
      </Head>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/40 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold">🍭 DRep.fun</Link>
          <span className="text-xs bg-pink-500/30 border border-pink-400/30 px-2 py-0.5 rounded-full text-pink-300">
            Admin · ElRaulito
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-green-300">Connected</span>
            </div>
          ) : (
            <>
              <select
                value={walletId || ''}
                onChange={e => setWalletId(e.target.value)}
                className="bg-gray-900 text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
              >
                <option value="" className="bg-gray-900 text-white">Select wallet</option>
                {wallets.map(w => <option key={w.id} value={w.id} className="bg-gray-900 text-white">{w.name}</option>)}
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

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold mb-1">Vote as ElRaulito</h1>
        <p className="text-white/40 text-xs font-mono mb-1 break-all">Script DRep · {drepId}</p>
        <p className="text-white/50 text-sm mb-8">
          Select proposals to batch vote, or click individual vote buttons.
        </p>

        {/* Batch vote toolbar */}
        {selectedVotes.size > 0 && (
          <div className="sticky top-[73px] z-10 bg-purple-900/90 backdrop-blur border border-purple-400/30 rounded-xl px-4 py-3 mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-purple-200 font-medium">{selectedVotes.size} selected</span>
            <button
              onClick={() => { setBatchRationale(''); setShowBatchModal(true); }}
              disabled={isBatchVoting || !isConnected}
              className="ml-auto bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition"
            >
              {isBatchVoting ? 'Submitting…' : `Submit ${selectedVotes.size} vote${selectedVotes.size > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => setSelectedVotes(new Map())}
              className="text-xs text-white/30 hover:text-white/60"
            >
              Clear
            </button>
          </div>
        )}

        {loadingProposals ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-center text-white/40 py-20">No proposals found.</p>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => {
              const key = `${p.tx_hash}_${p.cert_index}`;
              const m = meta[key];
              const title = m?.json_metadata?.body?.title;
              const abstract = m?.json_metadata?.body?.abstract;
              const txHash = txHashes[key];
              const isSelected = selectedVotes.has(key);
              const proposalVoteKind = selectedVotes.get(key) ?? 'Yes';
              const typeStyle = TYPE_STYLES[p.type] ?? TYPE_STYLES.InfoAction;

              return (
                <div
                  key={key}
                  className={`border rounded-xl p-5 transition cursor-pointer ${
                    isSelected
                      ? 'bg-purple-500/15 border-purple-400/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
                  }`}
                  onClick={() => !txHash && toggleSelect(key)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${typeStyle}`}>
                        {p.type}
                      </span>
                      {p.epoch_no && (
                        <span className="text-xs text-white/30">expires epoch {p.epoch_no}</span>
                      )}
                    </div>
                    {!txHash && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(key)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 accent-purple-500 cursor-pointer flex-shrink-0"
                      />
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
                      ✓ Vote submitted ·{' '}
                      <a
                        href={`https://cardanoscan.io/transaction/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs underline opacity-70 hover:opacity-100"
                        onClick={e => e.stopPropagation()}
                      >
                        {txHash.slice(0, 24)}…
                      </a>
                    </div>
                  ) : isSelected ? (
                    /* Per-proposal vote picker shown when the card is selected for batch */
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      {(['Yes', 'No', 'Abstain'] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setProposalVote(key, v)}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition ${
                            proposalVoteKind === v
                              ? v === 'Yes' ? 'bg-green-500 border-green-400 text-white'
                                : v === 'No' ? 'bg-red-500 border-red-400 text-white'
                                : 'bg-gray-600 border-gray-500 text-white'
                              : v === 'Yes' ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : v === 'No' ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* Normal single-vote buttons when not selected */
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      {(['Yes', 'No', 'Abstain'] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => { setVoteModal({ proposal: p, voteKind: v }); setRationale(''); }}
                          disabled={!isConnected}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition hover:scale-[1.03] disabled:opacity-30 ${
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Vote modal */}
      {voteModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => e.target === e.currentTarget && setVoteModal(null)}
        >
          <div className="bg-[#1a0a2e] border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-1">Cast Your Vote</h2>
            <p className="text-white/40 text-xs font-mono mb-4 break-all">
              {voteModal.proposal.tx_hash}#{voteModal.proposal.cert_index}
            </p>

            <div className="flex gap-2 mb-5">
              {(['Yes', 'No', 'Abstain'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVoteModal({ ...voteModal, voteKind: v })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    voteModal.voteKind === v
                      ? v === 'Yes' ? 'bg-green-500 border-green-400 text-white'
                        : v === 'No' ? 'bg-red-500 border-red-400 text-white'
                        : 'bg-gray-600 border-gray-500 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <label className="block text-sm text-white/60 mb-2">
              Rationale{' '}
              <span className="text-white/30 text-xs">(optional — stored on S3, anchored to vote)</span>
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
                {isVoting ? 'Submitting…' : `Vote ${voteModal.voteKind}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch vote modal */}
      {showBatchModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => e.target === e.currentTarget && setShowBatchModal(false)}
        >
          <div className="bg-[#1a0a2e] border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-1">Batch Vote Summary</h2>
            <p className="text-white/50 text-sm mb-4">
              {selectedVotes.size} proposal{selectedVotes.size > 1 ? 's' : ''} will be submitted in one transaction.
            </p>

            {/* Per-proposal summary */}
            {(() => {
              const selected = proposals.filter(p => selectedVotes.has(`${p.tx_hash}_${p.cert_index}`));
              const totalWithdrawal = selected.reduce((sum, p) => {
                const key = `${p.tx_hash}_${p.cert_index}`;
                return sum + proposalTotalWithdrawal(meta[key]);
              }, 0);
              return (
                <>
                  <div className="space-y-1 mb-3 max-h-48 overflow-y-auto pr-1">
                    {selected.map(p => {
                      const key = `${p.tx_hash}_${p.cert_index}`;
                      const vk = selectedVotes.get(key)!;
                      const title = meta[key]?.json_metadata?.body?.title;
                      const withdrawal = proposalTotalWithdrawal(meta[key]);
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-3 py-2">
                          <span className="text-sm text-white/80 truncate flex-1">
                            {title ? stripMarkdown(title) : `${p.tx_hash.slice(0, 12)}…`}
                          </span>
                          {withdrawal > 0 && (
                            <span className="text-xs text-yellow-300 flex-shrink-0">{lovelaceToAda(withdrawal)}</span>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            vk === 'Yes' ? 'bg-green-500/30 text-green-300'
                            : vk === 'No' ? 'bg-red-500/30 text-red-300'
                            : 'bg-gray-500/30 text-gray-300'
                          }`}>{vk}</span>
                        </div>
                      );
                    })}
                  </div>
                  {totalWithdrawal > 0 && (
                    <div className="flex justify-between items-center bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 mb-4">
                      <span className="text-sm text-yellow-200">Total treasury withdrawal</span>
                      <span className="text-sm font-bold text-yellow-300">{lovelaceToAda(totalWithdrawal)}</span>
                    </div>
                  )}
                </>
              );
            })()}

            <label className="block text-sm text-white/60 mb-2">
              Rationale{' '}
              <span className="text-white/30 text-xs">(optional — one statement for all votes, stored on S3)</span>
            </label>
            <textarea
              value={batchRationale}
              onChange={e => setBatchRationale(e.target.value)}
              placeholder="Why are you voting this way on these proposals?"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 resize-none mb-5 focus:outline-none focus:border-purple-400 transition"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowBatchModal(false)}
                className="flex-1 py-2 rounded-lg border border-white/15 text-white/50 text-sm hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitBatchVote}
                disabled={isBatchVoting}
                className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition"
              >
                {isBatchVoting ? 'Submitting…' : `Submit ${selectedVotes.size} vote${selectedVotes.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
