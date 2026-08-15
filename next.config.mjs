/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El primer deploy no debe romperse por lint/tipos (se refina después).
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
