import { defineConfig } from 'vite';
export default defineConfig({ base: '/tekuteku/', server: { watch: { ignored: ['**/worker/**'] } } });
