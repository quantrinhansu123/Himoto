/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/huong-dan': ['./docs/huong-dan-su-dung/HUONG-DAN-SU-DUNG-HIMOTO.md'],
    '/api/mobile/v1/contracts/*/print': ['./src/styles/contract-print.css'],
    '/api/mobile/v1/battery-contracts/*/print': ['./src/styles/contract-print.css'],
  },
};
