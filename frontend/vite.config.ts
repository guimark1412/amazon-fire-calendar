import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-leaflet',
              test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/,
            },
            {
              name: 'vendor-recharts',
              test: /node_modules[\\/](recharts|d3-|victory-vendor)/,
            },
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
