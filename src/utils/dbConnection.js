/**
 * Shared Database Connection Utility
 * 
 * Provides a consistent way to connect to MongoDB using MONGO_DB_NAME.
 * All scripts should use this utility to ensure they connect to the correct database.
 * 
 * Usage:
 *   const { getConnectionUri, connect, disconnect } = require('./dbConnection');
 *   const uri = getConnectionUri();
 *   await connect(uri);
 *   // ... do work ...
 *   await disconnect();
 */

require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

/**
 * Get the MongoDB connection URI with MONGO_DB_NAME applied
 * @returns {string} The MongoDB connection URI
 */
function getConnectionUri() {
  // Accept multiple env var names for compatibility
  const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
  const mongoDbName = process.env.MONGO_DB_NAME || null;

  let uri = rawMongoUri;
  
  if (mongoDbName) {
    const idx = rawMongoUri.indexOf('?');
    const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
    const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
    
    if (!hasDb) {
      if (idx === -1) {
        uri = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
      } else {
        uri = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
      }
    } else {
      // Replace existing database name with the one from MONGO_DB_NAME
      const parts = beforeQuery.split('/');
      parts[parts.length - 1] = mongoDbName;
      uri = idx === -1 ? parts.join('/') : `${parts.join('/')}${rawMongoUri.slice(idx)}`;
    }
  }
  
  return uri;
}

/**
 * Connect to MongoDB
 * @param {string} uri - MongoDB connection URI (optional, will use getConnectionUri if not provided)
 * @returns {Promise<void>}
 */
async function connect(uri = null) {
  const mongoose = require('mongoose');
  const connectionUri = uri || getConnectionUri();
  await mongoose.connect(connectionUri, { useNewUrlParser: true, useUnifiedTopology: true });
}

/**
 * Disconnect from MongoDB
 * @returns {Promise<void>}
 */
async function disconnect() {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

module.exports = {
  getConnectionUri,
  connect,
  disconnect
};

