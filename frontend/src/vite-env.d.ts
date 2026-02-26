/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PIGGYBANK_ADDRESS: string;
    readonly VITE_MOTO_TOKEN_ADDRESS: string;
    readonly VITE_NETWORK: string;
    readonly VITE_RPC_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
