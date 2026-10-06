import { defineConfig } from "astro/config";

import node from "@astrojs/node";

export default defineConfig({
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  security: {
    // Fly's edge proxy terminates TLS and forwards to this app over plain
    // HTTP, so without this, Astro's same-origin check sees every real
    // HTTPS request as a protocol mismatch (Origin: https://..., but the
    // request it reconstructs says http://...) and blocks it as cross-site.
    // This tells Astro to trust X-Forwarded-Proto/Host for this exact host.
    allowedDomains: [{ protocol: "https", hostname: "comp4020-final-u8033161.fly.dev" }],
  },
});