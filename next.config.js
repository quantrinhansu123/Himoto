/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return process.env.VERCEL ? {beforeFiles:[{source:'/api/:path*',destination:'https://app.himoto.vn/api/:path*'}]} : [];
  },
};
