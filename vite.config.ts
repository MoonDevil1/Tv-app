import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ plugins:[react()], base:'./', build:{outDir:'dist'}, server:{host:'127.0.0.1'}, resolve:{alias:{'@':resolve(__dirname,'src')}} });