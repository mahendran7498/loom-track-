const dns = require("dns");

// Some Windows/corporate DNS resolvers reject Atlas SRV lookups. Keep the
// resolver used by the web server and one-off database scripts consistent.
const servers = (process.env.MONGODB_DNS_SERVERS || "8.8.8.8,8.8.4.4")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (servers.length) dns.setServers(servers);

