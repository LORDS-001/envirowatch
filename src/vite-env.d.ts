/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_SIM_SEED?: string;
  readonly VITE_DISPLAY_TZ?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
