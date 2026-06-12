/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // The CDNs actually used for banners/avatars. (next/image isn't used yet,
    // but keep these accurate so a future switch doesn't break image loading.)
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
