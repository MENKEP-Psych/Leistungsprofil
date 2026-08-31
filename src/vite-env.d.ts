/// <reference types="vite/client" />

// Zur Build-Zeit über vite `define` injiziert (siehe vite.config.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __GIT_SHA__: string;
