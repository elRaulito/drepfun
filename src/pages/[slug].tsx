import Head from "next/head";
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { BrowserWallet, Wallet, MeshTxBuilder, MaestroProvider, keepRelevant, Transaction, DRep } from "@meshsdk/core";

export default function SlugPage() {
  const router = useRouter();
  const { slug } = router.query; // Capture the dynamic part of the URL

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [pageData, setPageData] = useState<string | null>(null);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  // Fetch the wallets available on the browser
  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const availableWallets = await BrowserWallet.getAvailableWallets();
        setWallets(availableWallets);
        console.log(availableWallets);
      } catch (error) {
        console.error("Error fetching wallets:", error);
      }
    };
    fetchWallets();
  }, []);

  // Set the generic welcome message
  useEffect(() => {
    if (slug) {
      setPageData(`Welcome! In this page, you'll be able to delegate your voting power to a DRep.`);
    }
  }, [slug]);

  // Handle connecting a wallet
  const handleConnectWallet = async () => {
    try {
      if (selectedWalletId) {
        const wallet: BrowserWallet = await BrowserWallet.enable(selectedWalletId, [95]);
        setSelectedWallet(wallet);
        setIsConnected(true);
        console.log("Connected to wallet:", selectedWalletId);
      } else {
        alert("Please select a wallet to connect.");
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setIsConnected(false);
    }
  };

  // Handle transaction for vote delegation
  const handleVoteDelegation = async () => {
    if (!selectedWallet) {
      alert("Please connect a wallet first.");
      return;
    }

    setIsTransactionLoading(true);

    try {
      // Step 1: Set up the MaestroProvider and Transaction Builder
      const maestroProvider = new MaestroProvider({
        network: "Mainnet",
        apiKey: "3XP2KDVmZvUrcnxVjPE9R7ZMExzQMNI1",
        turboSubmit: false
      });

      const txBuilder = new MeshTxBuilder({
        fetcher: maestroProvider,
        verbose: true
      });

      const tx = new Transaction({ initiator: selectedWallet });

      // Step 2: Fetch required wallet addresses and UTXOs
      const changeAddress = await selectedWallet.getChangeAddress();
      const utxos = await selectedWallet.getUtxos();
      const rewardAddresses = await selectedWallet.getRewardAddresses();
      const rewardAddress = rewardAddresses[0]; // Delegate to the first reward address

      // Step 3: Set transaction parameters (fees, UTXOs, change address, and delegation)
      const registrationFee = "100000000"; // 100 ADA
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);

      // Step 4: Add transaction components (UTXOs, change address, vote delegation)
      let drepId: DRep = { dRepId: slug as string };
      txBuilder
        .selectUtxosFrom(selectedUtxos)
        .changeAddress(changeAddress)
        .voteDelegationCertificate(drepId, rewardAddress); // Delegate voting power to SLUG

      // Step 5: Complete, sign, and submit the transaction
      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);

      // Step 6: Set the transaction hash and show success message
      setTransactionHash(txHash);
      console.log(`Transaction successful! Tx ID: ${txHash}`);
    } catch (error) {
      console.error("Error processing transaction:", error);
    } finally {
      setIsTransactionLoading(false);
    }
  };

  // Function to shorten the DRep ID (e.g., "drep_script...d8mz2")
  const formatDRepId = (id: string) => {
    return `${id.slice(0, 12)}...${id.slice(-5)}`;
  };

  // If slug is not yet loaded
  if (!slug) {
    return <div>Loading...</div>;
  }

  // Check if slug matches specific DRep (drep_script1tu2ttdwdmvyrnhczd9segf5w7jr88qmdwam60szll5hnuyd8mz2)
  const isElRaulito = slug === 'drep_script1tu2ttdwdmvyrnhczd9segf5w7jr88qmdwam60szll5hnuyd8mz2';

  return (
    <div className="bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 min-h-screen flex flex-col">
      <Head>
        <title>{`Delegate Voting to DRep`}</title>
        <meta name="description" content={`Delegate your voting power to a DRep`} />
      </Head>

      {/* Header */}
      <header className="flex justify-between p-4 items-center">
        <div className="text-2xl font-bold text-pink-800">🍭 Delegate to a DRep 🍬</div>
        <div className="flex items-center space-x-4">
          <div className="relative inline-block">
            <select
              value={selectedWalletId || ""}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="bg-white p-2 rounded shadow-md focus:outline-none text-gray-700 pr-10"
            >
              <option value="">Select Wallet</option>
              {wallets.map((wallet, index) => (
                <option key={index} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
            {selectedWalletId && (
              <img
                src={wallets.find(wallet => wallet.id === selectedWalletId)?.icon}
                alt="Wallet Icon"
                className="absolute top-1/2 transform -translate-y-1/2 right-2 w-6 h-6 rounded-full"
              />
            )}
          </div>
          <button
            onClick={handleConnectWallet}
            className="bg-pink-500 text-white py-2 px-4 rounded-full hover:bg-pink-600 shadow-md transition"
            disabled={isConnected}
          >
            {isConnected ? "Connected" : "Connect"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-purple-700 mb-6">{`Delegate Voting to: ${formatDRepId(slug as string)}`}</h1>
        {pageData && <p className="mt-4 text-lg px-4">{pageData}</p>}

        {/* Show Image and Name for Specific DRep */}
        {isElRaulito && (
          <div className="flex flex-col items-center mt-6">
            <img src="/pfp.png" alt="ElRaulito Profile Picture" className="w-24 h-24 rounded-full mb-4" />
            <p className="text-2xl font-bold text-gray-700">ElRaulito</p>
          </div>
        )}

        <button
          onClick={handleVoteDelegation}
          className="bg-green-500 text-white py-2 px-6 rounded-full hover:bg-green-600 disabled:bg-gray-400 transition shadow-md mt-4"
          disabled={isTransactionLoading || !isConnected}
        >
          {isTransactionLoading ? "Processing..." : `Delegate`}
        </button>

        {transactionHash && (
          <div className="mt-4 text-green-600">
            <p className="font-bold">Transaction Successful!</p>
            <p>Tx ID: {transactionHash}</p>
          </div>
        )}
      </main>
    </div>
  );
}
