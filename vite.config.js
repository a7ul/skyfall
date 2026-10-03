import {defineConfig} from 'vite';
import {lyonLegacyTiles} from './tools/vite/lyonLegacyTiles.js';

export default defineConfig({
  plugins:[lyonLegacyTiles()]
});
