import Head from "next/head";
import { useEffect, useState } from "react";
import { CardanoWallet, MeshBadge } from "@meshsdk/react";
import {
  BrowserWallet,
  BlockfrostProvider,
  MeshTxBuilder,
  keepRelevant,
  hashDrepAnchor,
  Wallet,
  deserializeAddress,
  NativeScript,
  serializeNativeScript,
  resolveScriptHashDRepId,
  resolveNativeScriptHash,resolveNativeScriptHex,resolveSlotNo  ,Transaction ,mConStr0,
  MaestroProvider
} from "@meshsdk/core";

import { blake2b  } from "blakejs";
import cbor from "cbor";

import blueprint from './plutus.json'; // Adjust path as needed

// Function to hash a JSON file using BLAKE2b-256 to match b2sum output
const hashJsonObject = (jsonObject:any) => {
  // Serialize the JSON object with spacing to match the command line format
  let jsonString = jsonObject
  // Encode the JSON string as a UTF-8 byte array
  const inputBytes = new TextEncoder().encode(jsonString);

  // Hash the UTF-8 byte array using BLAKE2b with 32 bytes (256 bits) output
  const hashBytes = blake2b(inputBytes, undefined, 32);

  // Convert the hash bytes to a hex string
  const hashHex = Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return hashHex;
};
  // Fetch and hash the JSON from the returned URL
  async function getMeshJsonHash(url:any) {
    const drepAnchor = await fetch(url);
    const anchorObj = await drepAnchor.text();
    console.log(drepAnchor)
    console.log(anchorObj)
    console.log("hashes")
    //console.log(hashDrepAnchor(anchorObj))
    console.log(hashJsonObject(anchorObj))

    
    return hashJsonObject(anchorObj); // Assuming hashDrepAnchor is a predefined function
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

      //const dRep = await selectedWallet.getDRep();
      let dRep=""
      if (dRep) {
        //const dRepId = dRep.dRepIDCip105;
        //setDRepId(dRepId);
      } else {
        // Handle the case where dRep is undefined
        console.warn("dRep is undefined");
      }
  
      const changeAddress = await selectedWallet.getChangeAddress();
      const { pubKeyHash: keyHash } = deserializeAddress(changeAddress);

      const nativeScripts = [];
      const drepIds:any = [];
      
      for (let slot = 10; slot <= 12; slot++) {
        // Create a NativeScript object for each slot time
        const nativeScript:NativeScript = {
          type: "all",
          scripts: [
            {
              type: "sig",
              keyHash: keyHash,
            },
            {
              type: "after",
              slot: slot.toString(),
            },
          ],
        };
      
        // Serialize the nativeScript and calculate the drepId
        const { scriptCbor } = serializeNativeScript(nativeScript);
        const drepId = resolveScriptHashDRepId(resolveNativeScriptHash(nativeScript));
      
        // Add the nativeScript and drepId to their respective arrays
        nativeScripts.push(nativeScript);
        drepIds.push(drepId);
      }
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
      let maestroProvide = new MaestroProvider({network:"Mainnet",apiKey:"3XP2KDVmZvUrcnxVjPE9R7ZMExzQMNI1",turboSubmit:false},)
  
      let txBuilder = new MeshTxBuilder({
        fetcher: maestroProvide,
        //evaluator: maestroProvide,
        verbose:true
      });
  

      const tx = new Transaction({ initiator: selectedWallet });


      const registrationFee = "500000000";
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);
      
      nativeScripts.forEach((nativeScript, index) => {
        const drepId = drepIds[index];
        
        

      })

      let count=2

   
      const drepId = resolveScriptHashDRepId("5f14b5b5cddb0839df02696194268ef48673836d7777a7c05ffd2f3e");

      let rightScript=cbor
      .encode(Buffer.from("5902f00101003232323232323225333002323232323232323232323232533300e3370e900300389919191802007180a980b0011bad3014001301037540102a66601c66e1d2008007132300200c3013301037540102a66601c66e1d200a0071323232300400e30153016002375a602800260206ea8020588c94ccc03cc01cc040dd5000899192999808980498091baa0011325333012300a30133754002264a666026601660286ea80044c94ccc050c8c004c94ccc058c008c05cdd50008a400026eb4c06cc060dd500099299980b1801180b9baa00114c0103d87a8000132330010013756603860326ea8008894ccc06c004530103d87a8000132323232533301c337229110b000de14042756438383632000021533301c3371e91010b000de14042756438383632000021301333020375000297ae014c0103d87a8000133006006003375a603a0066eb8c06c008c07c008c074004c8cc004004dd59805180c1baa300a3018375400e44a666034002298103d87a8000132323232533301b337229111c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f000021533301b3371e91011c4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f00002130123301f374c00297ae014c0103d87a8000133006006003375660380066eb8c068008c078008c070004dc3a4004264660020026eb0c068c06cc06cc06cc06cc06cc06cc06cc06cc05cdd500411299980c8008a5013253330173371e6eb8c070008010528899801801800980e0008a50375c6030602a6ea800458c05cc050dd50008b180b18099baa00116300430123754602a60246ea8c010c048dd5000980a18089baa00116330033758600460206ea800520002301230130013001001222533301000214c0103d87a800013232533300f300700313006330130024bd70099980280280099b8000348004c05000cc048008dd2a40006e1d2000300837540026016601800460140026014004601000260086ea8004526136565734aae7555cf2ab9f5740ae855d101", "hex"))
      .toString("hex")

      txBuilder
      .txInCollateral("6f69a8ed4e307bfb1d29e79f223c2bbf1debbb4c632bce72e2e3b8043a685224", 0)
      .drepRegistrationCertificate(drepId, {
        anchorUrl: anchorUrl,
        anchorDataHash: anchorHash,
      })
      .readOnlyTxInReference("80e9b65d4b8cd8fd7af00bc3984ffc192b25f4c848a9a93b40e72b1bafa51eb2",2)
     .certificateScript(rightScript,"V3")
     .certificateRedeemerValue(mConStr0([]), "Mesh", {mem: 200000, steps: 50000000}) 
     .requiredSignerHash("fd3a6bfce30d7744ac55e9cf9146d8a2a04ec7fb2ce2ee6986260653")
     .changeAddress(changeAddress)
      .selectUtxosFrom(selectedUtxos);
      
  
      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);
  
      setTransactionHash(txHash);
      console.log(`Transaction successful! Tx ID: ${txHash}`);

      

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
      //const dRep = await selectedWallet.getDRep();
      let dRep="1"
      if(dRep){
      //const dRepId = dRep.dRepIDCip105;
      const changeAddress = await selectedWallet.getChangeAddress();
      const { pubKeyHash: keyHash } = deserializeAddress(changeAddress);

      const nativeScripts = [];
      const drepIds:any = [];
      
      for (let slot = 10; slot <= 12; slot++) {
        // Create a NativeScript object for each slot time
        const nativeScript:NativeScript = {
          type: "all",
          scripts: [
            {
              type: "sig",
              keyHash: keyHash,
            },
            {
              type: "after",
              slot: slot.toString(),
            },
          ],
        };
      
        let scriptCbor =
        "58ff58fd01010033232323232322322533300432323232323232533300b3370e9002001099198011bac301030113011301130113011301130113011300e375400e014601e601a6ea800c54ccc02ccdc3a400c0042646464660086eb0c048c04cc04cc04cc04cc04cc04cc04cc04cc040dd5004806180898090011bad3010001300d37540062c44646600200200644a66602200229404c94ccc03ccdc79bae301300200414a2266006006002602600260146ea8004c030c034008c02c004c02c008c024004c018dd50008a4c26cac6eb80055cd2ab9d5573caae7d5d0aba24c011e581ce3d28c78fa125198affefff50269125c81ba34e598890ed1d077f1710001";

        //const drepId = resolveScriptHashDRepId(resolveNativeScriptHash(scriptCbor));
      
        // Add the nativeScript and drepId to their respective arrays
        nativeScripts.push(nativeScript);
        //drepIds.push(drepId);
      }
      console.log("hash")
      const utxos = await selectedWallet.getUtxos();

      const blockchainProvider = new BlockfrostProvider('mainnet5JnwhqGoyF2CyTjns9IRXFrqysfJeQZl');

      const txBuilder = new MeshTxBuilder({
        fetcher: blockchainProvider,
        evaluator: blockchainProvider,
        verbose: true,
      });

      const registrationFee = "3000000000";
      const assetMap = new Map();
      assetMap.set("lovelace", registrationFee);
      const selectedUtxos = keepRelevant(assetMap, utxos);


      nativeScripts.forEach((nativeScript, index) => {
        const drepId:any = drepIds[index];
       
        

      });

      let count=2


      const drepId = resolveScriptHashDRepId("5f14b5b5cddb0839df02696194268ef48673836d7777a7c05ffd2f3e");

      txBuilder
      .drepDeregistrationCertificate(drepId)
      .certificateScript("58ff58fd01010033232323232322322533300432323232323232533300b3370e9002001099198011bac301030113011301130113011301130113011300e375400e014601e601a6ea800c54ccc02ccdc3a400c0042646464660086eb0c048c04cc04cc04cc04cc04cc04cc04cc04cc040dd5004806180898090011bad3010001300d37540062c44646600200200644a66602200229404c94ccc03ccdc79bae301300200414a2266006006002602600260146ea8004c030c034008c02c004c02c008c024004c018dd50008a4c26cac6eb80055cd2ab9d5573caae7d5d0aba24c011e581ce3d28c78fa125198affefff50269125c81ba34e598890ed1d077f1710001")
      .selectUtxosFrom(selectedUtxos, undefined, "50000000")
      .changeAddress(changeAddress);


      const unsignedTx = await txBuilder.complete();
      const signedTx = await selectedWallet.signTx(unsignedTx);
      const txHash = await selectedWallet.submitTx(signedTx);

      setDeregistrationTxHash(txHash);
      console.log(`DRep deregistration successful! Tx ID: ${txHash}`);
      }}
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
        <meta name="description" content="Make being a Drep fun again." />
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
