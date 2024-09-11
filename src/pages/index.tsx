import Head from "next/head";
import { useEffect, useState } from "react";
import { CardanoWallet, MeshBadge } from "@meshsdk/react";
import {
  BrowserWallet,
  BlockfrostProvider,
  MeshTxBuilder,
  keepRelevant,
  hashDrepAnchor,
  Wallet
} from "@meshsdk/core";


  // Fetch and hash the JSON from the returned URL
  async function getMeshJsonHash(url:any) {
    const drepAnchor = await fetch(url);
    const anchorObj = await drepAnchor.json();
    return hashDrepAnchor(anchorObj); // Assuming hashDrepAnchor is a predefined function
  }
  

export default function Home() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactionHash, setTransactionHash] = useState<string| null>(null);
  const [dRepId, setDRepId] = useState<string| null>(null);
  const [isDRepLoading, setIsDRepLoading] = useState(false);
  const [isDeregistrationLoading, setIsDeregistrationLoading] = useState(false);
  const [deregistrationTxHash, setDeregistrationTxHash] = useState<string| null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string| null>(null);
  const [selectedWallet, setSelectedWallet] = useState<BrowserWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false); // New state to track connection status
  const [name, setName] = useState('');
  const [profileLink, setProfileLink] = useState('');

  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const availableWallets:any[] = await BrowserWallet.getAvailableWallets();
        setWallets(availableWallets);
        console.log(availableWallets);
      } catch (error) {
        console.error("Error fetching wallets:", error);
      }
    };

    fetchWallets();
  }, []);

  const handleConnectWallet = async () => {
    try {
      if (selectedWalletId) {
        const wallet:BrowserWallet = await BrowserWallet.enable(selectedWalletId, [95]);
        setSelectedWallet(wallet);
        setIsConnected(true); // Set isConnected to true when wallet is successfully connected
        console.log("Connected to wallet:", selectedWalletId);
      } else {
        alert("Please select a wallet to connect.");
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setIsConnected(false); // Optionally reset on error
    }
  };

  const handleDRepTransaction = async () => {
    if (!selectedWallet) {
      alert("Please connect a wallet first.");
      return;
    }
    setIsDRepLoading(true);
    try {
      if(selectedWallet!=undefined){

      const dRep = await selectedWallet.getDRep();
      if (dRep) {
        const dRepId = dRep.dRepIDCip105;
        setDRepId(dRepId);
      } else {
        // Handle the case where dRep is undefined
        console.warn("dRep is undefined");
      }
  
      const changeAddress = await selectedWallet.getChangeAddress();
      const utxos = await selectedWallet.getUtxos();
  
      // Create the JSON object as per the given structure
      const data = {
        "@context": {
          "CIP100": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0100/README.md#",
          "CIP119": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0119/README.md#",
          "hashAlgorithm": "CIP100:hashAlgorithm",
          "body": {
            "@id": "CIP119:body",
            "@context": {
              "references": {
                "@id": "CIP119:references",
                "@container": "@set",
                "@context": {
                  "GovernanceMetadata": "CIP100:GovernanceMetadataReference",
                  "Identity": "CIP100:IdentityReference",
                  "Link": "CIP100:LinkReference",
                  "Other": "CIP100:OtherReference",
                  "label": "CIP100:reference-label",
                  "uri": "CIP100:reference-uri",
                  "referenceHash": {
                    "@id": "CIP119:referenceHash",
                    "@context": {
                      "hashDigest": "CIP119:hashDigest",
                      "hashAlgorithm": "CIP100:hashAlgorithm"
                    }
                  }
                }
              },
              "paymentAddress": "CIP119:paymentAddress",
              "givenName": "CIP119:givenName",
              "image": "CIP119:image",
              "objectives": "CIP119:objectives",
              "motivations": "CIP119:motivations",
              "qualifications": "CIP119:qualifications",
              "doNotList": "CIP119:doNotList"
            }
          },
          "authors": {
            "@id": "CIP100:authors",
            "@container": "@set",
            "@context": {
              "name": "http://xmlns.com/foaf/0.1/name",
              "witness": {
                "@id": "CIP100:witness",
                "@context": {
                  "witnessAlgorithm": "CIP100:witnessAlgorithm",
                  "publicKey": "CIP100:publicKey",
                  "signature": "CIP100:signature"
                }
              }
            }
          }
        },
        "authors": [],
        "hashAlgorithm": "blake2b-256",
        "body": {
          "givenName": name,
          "paymentAddress": changeAddress,
          "references": [
            {
              "@type": "Identity",
              "label": "link",
              "uri": profileLink
            }
          ]
        }
      };
  
      // Send the JSON to the specified API and get the response URL
      const response = await fetch('https://71gm4oxpzk.execute-api.eu-west-2.amazonaws.com/default/storeDrep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
  
      if (!response.ok) {
        throw new Error('Failed to upload JSON to API');
      }
  
      const responseData = await response.json();
      console.log(responseData)
      const anchorUrl = responseData; // Assume the response contains the URL under "url"
  

      const anchorHash = await getMeshJsonHash(anchorUrl);
  
      const blockchainProvider = new BlockfrostProvider('mainnet5JnwhqGoyF2CyTjns9IRXFrqysfJeQZl');
  
      const txBuilder = new MeshTxBuilder({
        fetcher: blockchainProvider,
        evaluator: blockchainProvider,
      });
  
      const registrationFee = "500000000";
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);

      if(dRepId){
  
      txBuilder
        .drepRegistrationCertificate(dRepId, {
          anchorUrl: anchorUrl,
          anchorDataHash: anchorHash,
        })
        .changeAddress(changeAddress)
        .selectUtxosFrom(selectedUtxos);
  
      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);
  
      setTransactionHash(txHash);
      console.log(`Transaction successful! Tx ID: ${txHash}`);

      }

    }
    else{
      console.log("nothing")
    }
    } catch (error) {
      console.error("Error handling DRep transaction:", error);
    } finally {
      setIsDRepLoading(false);
    }
  };
  
  const handleDRepDeregistration = async () => {
    setIsDeregistrationLoading(true);
    try {

      if(selectedWallet!=undefined){
      const dRep = await selectedWallet.getDRep();
      if(dRep){
      const dRepId = dRep.dRepIDCip105;
      const changeAddress = await selectedWallet.getChangeAddress();
      const utxos = await selectedWallet.getUtxos();

      const blockchainProvider = new BlockfrostProvider('mainnet5JnwhqGoyF2CyTjns9IRXFrqysfJeQZl');

      const txBuilder = new MeshTxBuilder({
        fetcher: blockchainProvider,
        evaluator: blockchainProvider,
        verbose: true,
      });

      const registrationFee = "1000000000";
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);

      txBuilder
        .drepDeregistrationCertificate(dRepId)
        .selectUtxosFrom(selectedUtxos, undefined, "500000000")
        .changeAddress(changeAddress);

      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);

      setDeregistrationTxHash(txHash);
      console.log(`DRep deregistration successful! Tx ID: ${txHash}`);
    }
    }
    } catch (error) {
      console.error("Error during DRep deregistration:", error);
    } finally {
      setIsDeregistrationLoading(false);
    }
  };

  const handleGenerateJson = async () => {
    if (!selectedWallet) {
      alert("Please connect a wallet first.");
      return;
    }
  
    try {
      const changeAddress = await selectedWallet.getChangeAddress();
  
      const data = {
        "@context": {
          "CIP100": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0100/README.md#",
          "CIP119": "https://github.com/cardano-foundation/CIPs/blob/master/CIP-0119/README.md#",
          "hashAlgorithm": "CIP100:hashAlgorithm",
          "body": {
            "@id": "CIP119:body",
            "@context": {
              "references": {
                "@id": "CIP119:references",
                "@container": "@set",
                "@context": {
                  "GovernanceMetadata": "CIP100:GovernanceMetadataReference",
                  "Identity": "CIP100:IdentityReference",
                  "Link": "CIP100:LinkReference",
                  "Other": "CIP100:OtherReference",
                  "label": "CIP100:reference-label",
                  "uri": "CIP100:reference-uri",
                  "referenceHash": {
                    "@id": "CIP119:referenceHash",
                    "@context": {
                      "hashDigest": "CIP119:hashDigest",
                      "hashAlgorithm": "CIP100:hashAlgorithm"
                    }
                  }
                }
              },
              "paymentAddress": "CIP119:paymentAddress",
              "givenName": "CIP119:givenName",
              "image": "CIP119:image",
              "objectives": "CIP119:objectives",
              "motivations": "CIP119:motivations",
              "qualifications": "CIP119:qualifications",
              "doNotList": "CIP119:doNotList"
            }
          },
          "authors": {
            "@id": "CIP100:authors",
            "@container": "@set",
            "@context": {
              "name": "http://xmlns.com/foaf/0.1/name",
              "witness": {
                "@id": "CIP100:witness",
                "@context": {
                  "witnessAlgorithm": "CIP100:witnessAlgorithm",
                  "publicKey": "CIP100:publicKey",
                  "signature": "CIP100:signature"
                }
              }
            }
          }
        },
        "authors": [],
        "hashAlgorithm": "blake2b-256",
        "body": {
          "givenName": name,
          "paymentAddress": changeAddress,
          "references": [
            {
              "@type": "Identity",
              "label": "link",
              "uri": profileLink
            }
          ]
        }
      };
  
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "registration.json";
      link.click();
    } catch (error) {
      console.error("Error generating JSON:", error);
    }
  };
  

  return (
    <div className="bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 min-h-screen flex flex-col">
      <Head>
        <title>Drep.fun</title>
        <meta name="description" content="A Cardano dApp powered by Mesh" />
      </Head>
      <header className="flex justify-between p-4 items-center">
        <div className="text-3xl font-bold text-pink-800">🍭 Drep.fun 🍬</div>
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
        disabled={isConnected} // Optionally disable button once connected
      >
        {isConnected ? "Connected" : "Connect"}
      </button>

</div>

      </header>
      <main className="flex-grow flex flex-col items-center justify-center text-center">
        <h1 className="text-7xl font-bold text-purple-700 mb-10">Welcome to Drep.fun</h1>

        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-left mb-10">
          <h2 className="text-3xl font-bold mb-4 text-purple-600">Registration</h2>
          <label className="block mb-2 text-gray-700">Name </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 mb-4 bg-purple-100 rounded shadow-inner focus:outline-none"
          />
          <label className="block mb-2 text-gray-700">Profile Link (Twitter, github, personal website)</label>
          <input
            type="text"
            value={profileLink}
            onChange={(e) => setProfileLink(e.target.value)}
            className="w-full p-2 mb-4 bg-purple-100 rounded shadow-inner focus:outline-none"
          />
         
          <label className="block mb-1 text-green-300"> Platform fee 1 ADA</label>
        </div>

        <button
          onClick={handleDRepTransaction}
          className="bg-green-500 text-white py-2 px-4 rounded-full hover:bg-green-600 disabled:bg-gray-400 transition shadow-md mt-4"
          disabled={isDRepLoading}
        >
          {isDRepLoading ? "Initializing Transaction..." : "Register DRep"}
        </button>

        {dRepId && (
          <div className="mt-4 text-green-600">
            <p className="font-bold">DRep ID Retrieved!</p>
            <p>{dRepId}</p>
          </div>
        )}

        {transactionHash && (
          <div className="mt-4 text-green-600">
            <p className="font-bold">Transaction Successful!</p>
            <p>Tx ID: {transactionHash}</p>
          </div>
        )}
      </main>
      <button
        onClick={handleDRepDeregistration}
        className="fixed bottom-4 right-4 bg-orange-500 text-white py-2 px-4 rounded-full hover:bg-orange-600 disabled:bg-gray-400 transition shadow-md"
        disabled={isDeregistrationLoading}
      >
        {isDeregistrationLoading ? "Deregistering..." : "Deregister"}
      </button>

      {deregistrationTxHash && (
        <div className="fixed bottom-16 right-4 text-green-600">
          <p className="font-bold">Deregistration Successful!</p>
          <p>Tx ID: {deregistrationTxHash}</p>
        </div>
      )}
    </div>
  );
}
