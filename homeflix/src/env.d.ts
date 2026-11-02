/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do servidor pré-configurado no build (ex.: "192.168.15.165:8080"). */
  readonly VITE_DEFAULT_SERVER_URL?: string;
}

declare const __APP_VERSION__: string;
