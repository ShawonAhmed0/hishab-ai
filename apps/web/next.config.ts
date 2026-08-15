import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship raw TypeScript; Next compiles them itself.
  transpilePackages: [
    "@hishabai/shared",
    "@hishabai/accounting",
    "@hishabai/db",
    "@hishabai/core",
  ],
  // Catches links to routes that do not exist — worth the strictness on an app
  // whose navigation has nine destinations.
  typedRoutes: true,
};

export default config;
