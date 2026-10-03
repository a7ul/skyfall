import {defineConfig} from 'vite';
import {lyonLegacyTiles} from './tools/vite/lyonLegacyTiles.js';

export default defineConfig({
  base:process.env.VITE_BASE_PATH||'/',
  plugins:[lyonLegacyTiles()]
});
