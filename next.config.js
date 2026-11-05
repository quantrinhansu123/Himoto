/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/mobile/v1/contracts/*/print': ['./src/styles/contract-print.css'],
    '/api/mobile/v1/battery-contracts/*/print': ['./src/styles/contract-print.css'],
  },
};
