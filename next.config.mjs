/** @type {import('next').NextConfig} */
const nextConfig = {
    // Enable source maps in development
    webpack: (config, { dev, isServer }) => {
        if (dev && !isServer) {
            config.devtool = 'source-map'
        }
        return config
    }
};

export default nextConfig;
