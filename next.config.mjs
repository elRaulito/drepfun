// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true
    };

    // Add a rule for handling .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource', // Handles .wasm as an asset/resource
    });

    // Ensure correct MIME type for WASM files
    config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';

    return config;
  },
  output: 'export',  // Enable static export
};

export default nextConfig;
