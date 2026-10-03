import {defineConfig} from 'vite';
import {localMapPacks} from './tools/vite/localMapPacks.js';

export default defineConfig({
  plugins:[localMapPacks()]
});
