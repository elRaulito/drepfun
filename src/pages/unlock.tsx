import Head from "next/head";
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { BrowserWallet, Wallet, MeshTxBuilder, MaestroProvider, keepRelevant, Transaction, mConStr0 } from "@meshsdk/core";
import cbor from "cbor";

export default function UnlockPage() {
  const router = useRouter();
  const { slug } = router.query; // Capture the dynamic part of the URL
  
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

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

  // Handle unlocking transaction
  const handleUnlock = async () => {
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
      const collateral = await selectedWallet.getCollateral();

      // Here is the unlock transaction with the provided code
      const unsignedTx = await txBuilder
        .spendingPlutusScriptV3()
        .txIn(
          "2fc3697516032322d14b4ff4d17f844c5b9aeae484189f71f0e6e638941488cb", // The specific UTXO for unlock
          0
        )
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .txInScript(
          cbor
            .encode(Buffer.from(UnlockFeeRewardScript.script, "hex"))
            .toString("hex")
        )
        .changeAddress(changeAddress)
        .txInCollateral(
          collateral[0]?.input.txHash!,
          collateral[0]?.input.outputIndex!,
          collateral[0]?.output.amount!,
          collateral[0]?.output.address!
        )
        .requiredSignerHash(owner.stakeCredentialHash)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);

      setTransactionHash(txHash);
      console.log(`Unlock successful! Tx ID: ${txHash}`);
    } catch (error) {
      console.error("Error during unlock transaction:", error);
    } finally {
      setIsTransactionLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-green-300 via-blue-300 to-purple-300 min-h-screen flex flex-col">
      <Head>
        <title>Unlock Rewards</title>
        <meta name="description" content="Unlock your rewards using your wallet." />
      </Head>

      {/* Header with Wallet Connect on the top right */}
      <header className="flex justify-between p-4 items-center">
        <div className="text-3xl font-bold text-blue-800">🛠️ Unlock Rewards 🛠️</div>
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
            className="bg-blue-500 text-white py-2 px-4 rounded-full"
            disabled={isConnected}
          >
            {isConnected ? "Connected" : "Connect Wallet"}
          </button>
        </div>
      </header>

      {/* Main unlock section */}
      <main className="flex-grow flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Unlock Your Rewards</h1>

          <button
            onClick={handleUnlock}
            className="bg-purple-500 text-white py-2 px-4 rounded-full w-full"
            disabled={isTransactionLoading}
          >
            {isTransactionLoading ? "Submitting..." : "Unlock"}
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
