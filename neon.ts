import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  functions: {
    expirealbums: { name: 'Expire and purge albums', source: './.neon-build/expire/index.mjs' },
  },
  triggers: {
    'album-expiry': { type: 'schedule', function: 'expirealbums', cron: '0 2 * * *' },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
