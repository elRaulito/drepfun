import Head from "next/head";
import { useState } from "react";

export default function Home() {
  return (
    <div className="bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 min-h-screen flex flex-col">
      <Head>
        <title>Drep.fun</title>
        <meta name="description" content="Make being a Drep fun again." />
      </Head>
      
      {/* Header */}
      <header className="flex justify-between p-4 items-center">
        <div className="text-3xl font-bold text-pink-800">🍭 Drep.fun 🍬</div>
      </header>
      
      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center text-center">
        <h1 className="text-7xl font-bold text-purple-700 mb-10">
          Welcome to Drep.fun
        </h1>
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-left mb-10">
          <h2 className="text-3xl font-bold mb-4 text-purple-600">
            Coming Soon!
          </h2>
          <p className="text-gray-700 text-lg">
            Many exciting features are on their way to provide powerful governance tools for the best experience in decentralized decision-making.
          </p>
        </div>
      </main>
    </div>
  );
}
