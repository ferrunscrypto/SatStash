import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './',
    server: {
        port: 4000,
        strictPort: true,
    },
    plugins: [
        tailwindcss(),
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            overrides: {
                crypto: 'crypto-browserify',
            },
        }),
        react(),
    ],
    resolve: {
        alias: {
            global: 'global',
            undici: resolve(__dirname, 'node_modules/opnet/src/fetch/fetch-browser.js'),
        },
        mainFields: ['module', 'main', 'browser'],
        dedupe: ['@noble/curves', '@noble/hashes', '@scure/base', 'buffer', 'react', 'react-dom'],
    },
    build: {
        commonjsOptions: {
            strictRequires: true,
            transformMixedEsModules: true,
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'js/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.names?.[0] ?? '';
                    const info = name.split('.');
                    const ext = info[info.length - 1];
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext ?? '')) {
                        return 'images/[name][extname]';
                    }
                    if (/woff|woff2|eot|ttf|otf/i.test(ext ?? '')) {
                        return 'fonts/[name][extname]';
                    }
                    if (/css/i.test(ext ?? '')) {
                        return 'css/[name][extname]';
                    }
                    return 'assets/[name][extname]';
                },
                manualChunks(id) {
                    if (id.includes('crypto-browserify') || id.includes('randombytes')) {
                        return undefined;
                    }
                    if (id.includes('node_modules')) {
                        if (id.includes('@noble/curves')) return 'noble-curves';
                        if (id.includes('@noble/hashes')) return 'noble-hashes';
                        if (id.includes('@scure/')) return 'scure';
                        if (id.includes('@btc-vision/transaction')) return 'btc-transaction';
                        if (id.includes('@btc-vision/bitcoin')) return 'btc-bitcoin';
                        if (id.includes('@btc-vision/walletconnect')) return 'btc-walletconnect';
                        if (id.includes('react-router-dom')) return 'react-router';
                        if (id.includes('opnet')) return 'opnet';
                        if (id.includes('react-dom')) return 'react-dom';
                        if (id.includes('react')) return 'react';
                    }
                    return undefined;
                },
            },
        },
    },
});
