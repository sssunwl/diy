import { defineConfig } from 'vite';
export default defineConfig({ base: '/diy/', server: { watch: { ignored: ['**/worker/**'] } } });
