import Head from "next/head";
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { BrowserWallet, Wallet, MeshTxBuilder, MaestroProvider, keepRelevant, Transaction, DRep, mConStr0, resolveScriptHashDRepId } from "@meshsdk/core";
import { blake2b } from "blakejs";
import cbor from "cbor";

export default function VotePage() {
  const router = useRouter();
  const { slug } = router.query; // Capture the dynamic part of the URL
  
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [voteKind, setVoteKind] = useState("Yes"); // New state for vote selection
  
  // Fetch available wallets
  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const availableWallets = await BrowserWallet.getAvailableWallets();
        setWallets(availableWallets);
      } catch (error) {
        console.error("Error fetching wallets:", error);
      }
    };
    fetchWallets();
  }, []);
  
  // Handle connecting to wallet
  const handleConnectWallet = async () => {
    if (!selectedWalletId) {
      alert("Please select a wallet to connect.");
      return;
    }
    try {
      const wallet = await BrowserWallet.enable(selectedWalletId);
      setSelectedWallet(wallet);
      setIsConnected(true);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setIsConnected(false);
    }
  };
  
  // Handle voting transaction
  const handleVote = async () => {
    if (!selectedWallet) {
      alert("Please connect a wallet first.");
      return;
    }
    setIsTransactionLoading(true);
    try {
      const maestroProvider = new MaestroProvider({
        network: "Mainnet",
        apiKey: "3XP2KDVmZvUrcnxVjPE9R7ZMExzQMNI1",
        turboSubmit: false
      });

      const txBuilder = new MeshTxBuilder({ fetcher: maestroProvider, verbose: true });
      const tx = new Transaction({ initiator: selectedWallet });

      const changeAddress = await selectedWallet.getChangeAddress();
      const utxos = await selectedWallet.getUtxos();

      const drepId = resolveScriptHashDRepId("5f14b5b5cddb0839df02696194268ef48673836d7777a7c05ffd2f3e");

      let rightScript = cbor
        .encode(Buffer.from("5902f00101003232323232323225333002323232323232323232323232533300e3370e900300389919191802007180a980b0011bad3014001301037540102a66601c66e1d2008007132300200c3013301037540102a66601c66e1d200a0071323232300400e30153016002375a602800260206ea8020588c94ccc03cc01cc040dd5000899192999808980498091baa0011325333012300a30133754002264a666026601660286ea80044c94ccc050c8c004c94ccc058c008c05cdd50008a400026eb4c06cc060dd500099299980b1801180b9baa00114c0103d87a8000132330010013756603860326ea8008894ccc06c004530103d87a8000132323232533301c337229110b000de14042756438383632000021533301c3371e91010b000de14042756438383632000021301333020375000297ae014c0103d87a8000133006006003375a603a0066eb8c06c008c07c008c074004c8cc004004dd59805180c1baa300a3018375400e44a666034002298103d87a8000132323232533301b337229111c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f000021533301b3371e91011c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f00002130123301f374c00297ae014c0103d87a8000133006006003375660380066eb8c068008c078008c070004dc3a4004264660020026eb0c068c06cc06cc06cc06cc06cc06cc06cc06cc05cdd500411299980c8008a5013253330173371e6eb8c070008010528899801801800980e0008a50375c6030602a6ea800458c05cc050dd50008b180b18099baa00116300430123754602a60246ea8c010c048dd5000980a18089baa00116330033758600460206ea800520002301230130013001001222533301000214c0103d87a800013232533300f300700313006330130024bd70099980280280099b8000348004c05000cc048008dd2a40006e1d2000300837540026016601800460140026014004601000260086ea8004526136565734aae7555cf2ab9f5740ae855d101", "hex"))
        .toString("hex");

      const registrationFee = "100";
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);

      const dRepId = drepId; // Assume slug contains the DRep ID
      const collateral = await selectedWallet.getCollateral();

      txBuilder.txInCollateral(
        collateral[0]?.input.txHash!,
        collateral[0]?.input.outputIndex!,
        collateral[0]?.output.amount!,
        collateral[0]?.output.address!,
      )
      .votePlutusScriptV3()
      .vote(
        { type: "DRep", drepId: dRepId },
        {
          txHash: slug as string,
          txIndex: 0,
        },
        { voteKind } // Use the voteKind state here
      )
      .voteScript(rightScript)
      .voteRedeemerValue(mConStr0([]), "Mesh", {mem: 200000, steps: 50000000}) 
      .requiredSignerHash("fd3a6bfce30d7744ac55e9cf9146d8a2a04ec7fb2ce2ee6986260653")
      .readOnlyTxInReference("80e9b65d4b8cd8fd7af00bc3984ffc192b25f4c848a9a93b40e72b1bafa51eb2", 2)
      .changeAddress(changeAddress)
      .selectUtxosFrom(selectedUtxos);

      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);

      setTransactionHash(txHash);
      console.log(`Vote successful! Tx ID: ${txHash}`);
    } catch (error) {
      console.error("Error during voting transaction:", error);
    } finally {
      setIsTransactionLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 min-h-screen flex flex-col">
      <Head>
        <title>Vote on DRep</title>
        <meta name="description" content="Vote using your DRep." />
      </Head>

      {/* Header with Wallet Connect on the top right */}
      <header className="flex justify-between p-4 items-center">
        <div className="text-3xl font-bold text-pink-800">🍭 DRep Voting 🍬</div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedWalletId || ""}
            onChange={(e) => setSelectedWalletId(e.target.value)}
            className="bg-white p-2 rounded shadow-md"
          >
            <option value="">Select Wallet</option>
            {wallets.map((wallet, index) => (
              <option key={index} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleConnectWallet}
            className="bg-pink-500 text-white py-2 px-4 rounded-full"
            disabled={isConnected}
          >
            {isConnected ? "Connected" : "Connect Wallet"}
          </button>
        </div>
      </header>

      {/* Main voting section */}
      <main className="flex-grow flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Cast Your Vote</h1>

          {/* Checkbox for vote selection */}
          <div className="flex items-center mb-4">
            <label className="mr-2">Vote:</label>
            <input
              type="radio"
              id="voteYes"
              name="vote"
              value="Yes"
              checked={voteKind === "Yes"}
              onChange={() => setVoteKind("Yes")}
              className="mr-2"
            />
            <label htmlFor="voteYes" className="mr-4">Yes</label>
            <input
              type="radio"
              id="voteNo"
              name="vote"
              value="No"
              checked={voteKind === "No"}
              onChange={() => setVoteKind("No")}
              className="mr-2"
            />
            <label htmlFor="voteNo">No</label>
          </div>

          <button
            onClick={handleVote}
            className="bg-purple-500 text-white py-2 px-4 rounded-full w-full"
            disabled={isTransactionLoading}
          >
            {isTransactionLoading ? "Submitting..." : "Submit Vote"}
          </button>

          {/* Transaction Hash */}
          {transactionHash && (
            <div className="mt-4 text-green-600">
              <p>Transaction Submitted! Tx Hash:</p>
              <p>{transactionHash}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
