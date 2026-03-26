/**
 * Compatibility entrypoint.
 * The canonical worker bootstrap now lives at backend/src/workers.ts
 * so it can be compiled to backend/dist/workers.js for production.
 */

import './backend/src/workers';
