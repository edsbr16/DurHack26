import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
  server: {
    // Dev only: phones always use the built assets served by the bridge,
    // but the laptop dev loop proxies the socket to the bridge.
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
};
