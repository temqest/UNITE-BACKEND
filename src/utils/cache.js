const NodeCache = require('node-cache');

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

module.exports = cache;