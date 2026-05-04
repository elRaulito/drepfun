/**
 * Cardano NIGHT Claim TSX Page
 */

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { BrowserWallet } from '@meshsdk/core';

function hexToUint8Array(hexStr: string): Uint8Array {
  if (hexStr.length % 2 !== 0) throw new Error('Invalid hex string length');
  const arr = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hexStr.substr(i * 2, 2), 16);
  }
  return arr;
}


function indexOfPattern(arr: Uint8Array, pattern: number[]): number {
  for (let i = 0; i <= arr.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (arr[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

export default function NightClaimPage() {
  const [wallets, setWallets] = useState<string[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedAddress, setConnectedAddress] = useState<string>('');
  const [nightAmount, setNightAmount] = useState<number | null>(null);
  const [messageToSign, setMessageToSign] = useState<string>('');
  const [signature, setSignature] = useState<string>('');
  const [responseJson, setResponseJson] = useState<string>('');

  useEffect(() => {
    const fetchWallets = async () => {
      const available = await BrowserWallet.getAvailableWallets();
      const walletNames = available.map((wallet) => wallet.id);
      setWallets(walletNames);
    };
    fetchWallets();
  }, []);

  const connectWallet = async () => {
    if (!selectedWalletId) {
      alert('Please select a wallet.');
      return;
    }

    try {
      console.log(selectedWalletId)
      const wallet = await BrowserWallet.enable(selectedWalletId);
      const usedAddresses = await wallet.getUsedAddresses();
      const unusedAddresses = await wallet.getUnusedAddresses();
      const rewardAddresses = await wallet.getRewardAddresses();
      const changeAddress = usedAddresses[0];
      const dest = unusedAddresses[0]; //THIS COULD BE EMPTY SOMETIMES; IF SO WE NEED TO ASK USER TO MANUALLY INSERT IT
      const stakeAddress = rewardAddresses[0];
      setConnectedAddress(changeAddress);

      const balanceCheckUrl = `https://proof.provtree-midnight.com/check/cardano/${stakeAddress}`;
      const response = await fetch(balanceCheckUrl);
      const json = await response.json();
      const amount = json.value;
      const formattedAmount = amount / 1_000_000;
      setNightAmount(formattedAmount);
      console.log(amount)

      const fixedHash = '31a6bab50a84b8439adcfb786bb2020f6807e6e8fda629b424110fc7bb1c6b8b';
      //ADAWG IMPORTANT THIS ADDRESS NEEDS TO BE A NEW ONE SO USER MUST KNOW THAT IS A NEW ONE NOT USED BEFORE
      const destAddr = "addr1q9rm0yyxvw73cg6zp63gswyh7ks0lfhxz6d9sfphas2pzad0vu56m6enjpq6hhpk9862f5d4v8syu3j02xgap6wz50tsfxccc7";

      const message = `STAR ${amount} to ${destAddr} ${fixedHash}`;
      setMessageToSign(message);
      console.log(stakeAddress)
      console.log(message)
      console.log(Buffer.from(message, "utf8").toString("hex"))

      //const signed = await wallet.signData(stakeAddress, Buffer.from(message, "utf8").toString("hex"));
      const signed=await wallet.signData(Buffer.from(message, "utf8").toString("hex"),stakeAddress);
      console.log(signed)
      setSignature(signed.signature);



// Convert the full hex to Uint8Array
const bytes = hexToUint8Array(signed.key);

// We want to find the pattern [0x21, 0x58, 0x20] in bytes (key 33 + byte string(32))
const pattern = [0x21, 0x58, 0x20];


const pos = indexOfPattern(bytes, pattern);

let realkey=""
if (pos === -1) {
  console.error('Key 33 field not found!');
} else {
  // Extract the next 32 bytes after the 3-byte pattern
  const start = pos + pattern.length;
  const end = start + 32;
  if (end > bytes.length) {
    console.error('Not enough bytes for the last field');
  } else {
    const lastField = bytes.slice(start, end);
    // Convert back to hex for display
    const lastFieldHex = Array.from(lastField)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    console.log('Last field hex:', lastFieldHex);
    realkey=lastFieldHex
  }
}
    

      const payload = [
        {
          address: stakeAddress,
          amount: amount,
          cose_sign1: signed.signature,
          dest_address: destAddr,
          public_key: realkey,
        },
      ];

      const submitResponse = await fetch(
        'https://mainnet.prod.gd.midnighttge.io/claims/cardano',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await submitResponse.json();
      setResponseJson(JSON.stringify(result, null, 2));
      setIsConnected(true);
    } catch (error) {
      console.error('Error connecting wallet or processing claim:', error);
    }
  };

  return (
    <div className="bg-white min-h-screen py-10 px-4 font-sans">
      <Head>
        <title>Claim NIGHT Token</title>
      </Head>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-800 mb-6 text-center">
          Claim NIGHT Token
        </h1>

        <div className="mb-4">
        <label className="block text-gray-700 font-medium mb-2">Select Wallet:</label>
<select
  value={selectedWalletId}
  onChange={(e) => setSelectedWalletId(e.target.value)}
  className="w-full p-2 border border-gray-300 rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  <option value="" disabled hidden>-- Select Wallet --</option>
  {wallets.map((id) => (
    <option key={id} value={id}>
      {id}
    </option>
  ))}
</select>

        </div>

        <button
          onClick={connectWallet}
          className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 mb-6"
          disabled={isConnected}
        >
          {isConnected ? 'Connected' : 'Connect & Claim'}
        </button>

        {connectedAddress && (
          <div className="mb-2">
            <strong>Connected Address:</strong> {connectedAddress}
          </div>
        )}
        {nightAmount !== null && (
          <div className="mb-2">
            <strong>Amount to Claim:</strong> {nightAmount} NIGHT
          </div>
        )}
        {messageToSign && (
          <div className="mb-2">
            <strong>Message to Sign:</strong>
            <code className="block bg-gray-100 p-2 mt-1 rounded text-sm">
              {messageToSign}
            </code>
          </div>
        )}
        {signature && (
          <div className="mb-2">
            <strong>Signature:</strong>
            <code className="block bg-gray-100 p-2 mt-1 rounded text-sm break-words">
              {signature}
            </code>
          </div>
        )}
        {responseJson && (
          <div className="mt-4">
            <strong>API Response:</strong>
            <pre className="bg-gray-200 p-3 rounded mt-2 overflow-x-auto text-sm">
              {responseJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
