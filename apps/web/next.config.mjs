/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This machine has very little RAM (~1.8 GB). The webpack pack-file cache
  // caused "Failed to allocate memory" crashes during dev compiles, so it is
  // disabled here. Compiles are slightly slower but stable.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
