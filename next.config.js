/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  env: {
    // `.env.production` owns the reviewed public API origin. Keep local
    // development free to use NEXT_PUBLIC_API_HOST from `.env.local`, while a
    // stale platform-level value cannot override a production build.
    NEXT_PUBLIC_API_HOST:
      process.env.DRAFTY_PRODUCTION_API_HOST
      || process.env.NEXT_PUBLIC_API_HOST,
  },
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
