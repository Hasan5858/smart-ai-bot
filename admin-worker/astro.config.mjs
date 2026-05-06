import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  session: { driver: 'cookie' },
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
});
