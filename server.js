require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const routes = require('./src/routes');
const rateLimiter = require('./src/middleware/rateLimiter');
const http = require('http');
const socketIo = require('socket.io');

// Initialize Express app
const app = express();
// When behind a load balancer (Elastic Beanstalk), trust the proxy headers
if (process.env.NODE_ENV === 'production') {
  // trust first proxy (ELB/NLB) so req.protocol, req.secure, and req.ip are correct
  app.set('trust proxy', 1);
}
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['https://unite-development.vercel.app'])
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Expose io through the Express app for controllers to emit events
app.set('io', io);

// ==================== ENVIRONMENT VARIABLES ====================
const PORT = process.env.PORT || 3000;
// Accept multiple env names for compatibility
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
const mongoDbName = process.env.MONGO_DB_NAME || null; // optional DB name to ensure connection to a specific DB

// Validate required environment variables
if (!rawMongoUri) {
  console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
  console.error('Please create a .env file with MONGODB_URI or MONGO_URI');
  process.exit(1);
}

// If a DB name is provided separately and the URI does not already contain a DB path, append it.
let MONGO_URI = rawMongoUri;
if (mongoDbName) {
  // Determine if the URI already has a database name portion (i.e. after the host and before query '?')
  // We'll check for '/<dbname>' before any query string.
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  // If there is no DB portion (no slash followed by non-empty segment after the host), append one.
  // A simple heuristic: if beforeQuery ends with '/' or contains '/@' (unlikely), treat as missing.
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
    } else {
      MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
    }
  }
}

// ==================== SECURITY MIDDLEWARE ====================

// CORS Configuration
// For production, update allowedOrigins with your frontend domain
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : ['https://unite-development.vercel.app', 'https://www.unitehealth.tech'])
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow requests from allowed origins or in development
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-page-context']
};

// Production explicit CORS header middleware for known frontend domains
// Use configured `allowedOrigins` and only short-circuit OPTIONS when origin is allowed.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    // `allowedOrigins` is defined above and trimmed when read from env.
    if (origin && Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,x-page-context');

      // For preflight requests from an allowed origin, respond early with CORS headers
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }

    // For other cases, continue to `cors()` middleware which will reject disallowed origins.
    next();
  });
}

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body Parser Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security Headers
app.use((req, res, next) => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Only set Strict-Transport-Security in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// Request Logging Middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Redirect HTTP -> HTTPS when running in production behind a load balancer
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || '').toString();
    if (proto === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

// ==================== MONGODB CONNECTION ====================

// MongoDB Connection Options
const mongooseOptions = {
  // Remove deprecated options - mongoose 6+ handles these automatically
  serverSelectionTimeoutMS: 5000, // How long to try connecting before timing out
  socketTimeoutMS: 45000, // How long to wait for a response from the server
  family: 4, // Use IPv4, skip trying IPv6
  maxPoolSize: 5, // Limit connection pool for free tier
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB...');
    
    await mongoose.connect(MONGO_URI, mongooseOptions);
    
    console.log('✅ MongoDB Atlas connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    
    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
    // Handle process termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('💡 Make sure your MONGO_URI is correct and your IP is whitelisted in MongoDB Atlas');
    process.exit(1);
  }
};

// ==================== ROUTES ====================

// Health check route (before API routes)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'UNITE Blood Bank System API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

// Mount all API routes
// Apply a light global rate limiter (Redis-backed). Placed before routes so abusive requests are rejected early.
app.use(rateLimiter.general);

app.use('/', routes);

// ==================== SOCKET.IO SETUP ====================

const { messageService, presenceService, typingService, permissionsService } = require('./src/services/chat_services');
const { Notification: NotificationModel, User } = require('./src/models');
const notificationService = require('./src/services/utility_services/notification.service');
const s3 = require('./src/utils/s3');

// Store connected users: userId -> socketId
const connectedUsers = new Map();

io.use(async (socket, next) => {
  try {
    // Get token from handshake
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token
    const { verifyToken } = require('./src/utils/jwt');
    const decoded = verifyToken(token);

    socket.userId = String(decoded.id);
    socket.user = { ...decoded, id: String(decoded.id) };
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected with socket ${socket.id}`);

  // Store connection
  connectedUsers.set(socket.userId, socket.id);

  // Set user online
  presenceService.setOnline(socket.userId, socket.id);

  // Broadcast presence update
  socket.broadcast.emit('user_online', { userId: socket.userId });

  // Join user's personal room for direct messages
  socket.join(socket.userId);

  // Send message
    socket.on('send_message', async (data) => {
    try {
      const { receiverId, content, messageType = 'text', attachments = [] } = data;

      const message = await messageService.sendMessage(
        socket.userId,
        receiverId,
        content,
        messageType,
        attachments
      );

      // Prepare emitted copy with signed GET URLs for attachments
      let emittedMessage = message && message.toObject ? message.toObject() : message;
      if (emittedMessage && Array.isArray(emittedMessage.attachments) && emittedMessage.attachments.length > 0) {
        emittedMessage.attachments = await Promise.all(emittedMessage.attachments.map(async (att) => {
          if (att && att.key) {
            try {
              const signed = await s3.getSignedGetUrl(att.key, 60 * 60);
              return { ...att, url: signed };
            } catch (e) {
              return att;
            }
          }
          return att;
        }));
      }

      // Send to sender
      socket.emit('message_sent', emittedMessage);

      // Send to receiver if online
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', emittedMessage);

        // Mark as delivered
        await messageService.markAsDelivered(message.messageId, receiverId);
        socket.emit('message_delivered', { messageId: message.messageId });
      }

      // Create notification for receiver
      try {
        // Get receiver details to determine recipient type
        const mongoose = require('mongoose');
        let receiver = null;
        if (mongoose.Types.ObjectId.isValid(receiverId)) {
          receiver = await User.findById(receiverId);
        }
        if (!receiver) {
          receiver = await User.findOne({ userId: receiverId });
        }
        if (receiver) {
          // Get user's primary role from embedded roles array
          const activeRoles = (receiver.roles || []).filter(r => r.isActive !== false);
          const recipientType = activeRoles.length > 0 ? activeRoles[0].roleCode : 'user';
          await notificationService.createNewMessageNotification(
            receiverId,
            recipientType,
            socket.userId,
            message.messageId,
            message.conversationId,
            content
          );
        }
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
      }

      // Emit to conversation room (for future group chats)
      const conversationId = [socket.userId, receiverId].sort().join('_');
      socket.to(conversationId).emit('new_message', emittedMessage);

    } catch (error) {
      socket.emit('message_error', { error: error.message });
    }
  });

  // Mark message as read
  socket.on('mark_read', async (data) => {
    try {
      const { messageId } = data;
      await messageService.markAsRead(messageId, socket.userId);
      socket.emit('message_read', { messageId });
    } catch (error) {
      socket.emit('read_error', { error: error.message });
    }
  });

  // Typing indicators
  socket.on('typing_start', async (data) => {
    try {
      const { receiverId } = data;

      // Validate permissions
      const canChat = await permissionsService.canSendMessage(socket.userId, receiverId);
      if (!canChat) {
        socket.emit('typing_error', { error: 'You do not have permission to chat with this user' });
        return;
      }

      const conversationId = [socket.userId, receiverId].sort().join('_');

      typingService.startTyping(conversationId, socket.userId);

      // Notify receiver
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing_start', { userId: socket.userId, conversationId });
      }
    } catch (error) {
      socket.emit('typing_error', { error: error.message });
    }
  });

  socket.on('typing_stop', async (data) => {
    try {
      const { receiverId } = data;

      // Validate permissions
      const canChat = await permissionsService.canSendMessage(socket.userId, receiverId);
      if (!canChat) {
        return; // Silently fail for typing stop
      }

      const conversationId = [socket.userId, receiverId].sort().join('_');

      typingService.stopTyping(conversationId, socket.userId);

      // Notify receiver
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing_stop', { userId: socket.userId, conversationId });
      }
    } catch (error) {
      // Silently handle typing stop errors
    }
  });

  // Join conversation room
  socket.on('join_conversation', (data) => {
    const { conversationId } = data;
    socket.join(conversationId);
  });

  // Leave conversation room
  socket.on('leave_conversation', (data) => {
    const { conversationId } = data;
    socket.leave(conversationId);
  });

  // Get presence
  socket.on('get_presence', async (data) => {
    const { userIds } = data;
    const presences = await presenceService.getPresences(userIds);
    socket.emit('presence_update', presences);
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`User ${socket.userId} disconnected`);

    // Remove from connected users
    connectedUsers.delete(socket.userId);

    // Clear typing indicators
    typingService.clearUserTyping(socket.userId);

    // Set offline
    await presenceService.setOffline(socket.userId);

    // Broadcast offline status
    socket.broadcast.emit('user_offline', { userId: socket.userId });
  });

  // Handle manual offline (user closes app)
  socket.on('go_offline', async () => {
    await presenceService.setOffline(socket.userId);
    socket.broadcast.emit('user_offline', { userId: socket.userId });
  });

  // Handle idle status
  socket.on('set_idle', async () => {
    await presenceService.setIdle(socket.userId);
    socket.broadcast.emit('user_idle', { userId: socket.userId });
  });

  // Handle active status
  socket.on('set_active', async () => {
    await presenceService.setOnline(socket.userId, socket.id);
    socket.broadcast.emit('user_online', { userId: socket.userId });
  });
});

// ==================== ERROR HANDLING ====================

// 404 Handler - Catch all unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    method: req.method
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  // CORS Error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // Validation Errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: err.details || err.message
    });
  }
  
  // Mongoose Errors
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // MongoDB Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // Default Error
  console.error('❌ Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ==================== SERVER STARTUP ====================

// Start server function
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    // Initialize notification scheduler
    try {
      const notificationScheduler = require('./src/services/utility_services/notificationScheduler.service');
      notificationScheduler.start();
      console.log('✅ Notification scheduler started');
    } catch (schedulerError) {
      console.warn('⚠️  Failed to start notification scheduler:', schedulerError.message);
      // Don't fail server startup if scheduler fails
    }
    // Check AWS S3 connectivity (non-blocking failures)
    try {
      const s3Util = require('./src/utils/s3');
      if (s3Util && s3Util.BUCKET) {
        console.log(`🔐 S3 bucket configured: ${s3Util.BUCKET}`);
        s3Util.checkBucketConnectivity().then(result => {
          if (result.ok) {
            console.log(`✅ AWS S3 reachable and bucket '${result.bucket}' is accessible`);
          } else {
            console.warn(`⚠️  AWS S3 bucket check failed: ${result.error}`);
          }
        }).catch(err => {
          console.warn('⚠️  AWS S3 bucket check threw an error:', err && err.message ? err.message : err);
        });
      } else {
        console.warn('⚠️  No S3_BUCKET_NAME configured; file uploads to S3 will be disabled');
      }
    } catch (err) {
      console.warn('⚠️  Failed to initialize S3 connectivity check:', err && err.message ? err.message : err);
    }

    // Check email provider connectivity (non-blocking failures)
    try {
      const providerFactory = require('./src/services/utility_services/providers/EmailProviderFactory');
      const emailSender = (process.env.EMAIL_SENDER || '').toLowerCase().trim();
      
      // Determine which provider to test
      const isAWS = emailSender === 'aws' || !emailSender;
      const isBrevo = emailSender === 'brevo';

      if (isAWS) {
        // Check AWS SES connectivity
        const { SESClient, GetSendQuotaCommand } = require('@aws-sdk/client-ses');
        
        // Check if credentials are configured
        if (!process.env.AWS_ACCESS_KEY_EMAIL_ID || !process.env.AWS_SECRET_ACCESS_KEY_EMAIL) {
          console.warn('⚠️  AWS SES credentials not configured (AWS_ACCESS_KEY_EMAIL_ID or AWS_SECRET_ACCESS_KEY_EMAIL missing)');
          console.warn('⚠️  Email sending will be disabled');
        } else if (!process.env.EMAIL_USER) {
          console.warn('⚠️  EMAIL_USER not configured; email sending will fail');
        } else {
          console.log('📧 Checking AWS SES connectivity...');
          
          // Create a test SES client
          const testSESClient = new SESClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_EMAIL_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_EMAIL
            }
          });

          // Test connection by getting send quota (lightweight API call)
          testSESClient.send(new GetSendQuotaCommand({}))
            .then(result => {
              console.log('✅ AWS SES connected successfully');
              console.log(`   📊 Send Quota: ${result.Max24HourSend || 'N/A'} emails/day`);
              console.log(`   📊 Send Rate: ${result.MaxSendRate || 'N/A'} emails/second`);
              console.log(`   📊 Sent (24h): ${result.SentLast24Hours || 0} emails`);
              console.log(`   📧 From Address: ${process.env.EMAIL_USER}`);
              
              // Check daily email limit configuration
              const dailyLimit = process.env.DAILY_EMAIL_LIMIT;
              if (dailyLimit) {
                console.log(`   ⚙️  Daily Email Limit: ${dailyLimit} emails/day`);
              } else {
                console.warn('   ⚠️  DAILY_EMAIL_LIMIT not set; using default 200');
              }
            })
            .catch(err => {
              console.error('❌ AWS SES connection failed:', err.message || err.toString());
              if (err.name === 'InvalidClientTokenId' || err.name === 'SignatureDoesNotMatch') {
                console.error('   💡 Check your AWS_ACCESS_KEY_EMAIL_ID and AWS_SECRET_ACCESS_KEY_EMAIL credentials');
              } else if (err.name === 'AccessDenied') {
                console.error('   💡 AWS credentials lack SES permissions');
              } else {
                console.error('   💡 Verify AWS credentials and SES service availability');
              }
            });
        }
      } else if (isBrevo) {
        // Check Brevo API connectivity
        // Support multiple variable name formats for API key
        const apiKey = process.env.BREVO_EMAIL_API ||
                       process.env.BREVO_API_KEY ||
                       process.env.BREVO_API ||
                       process.env.Brevo_API;
        
        if (!apiKey) {
          console.warn('⚠️  Brevo API key not configured');
          console.warn('⚠️  Looking for: BREVO_EMAIL_API, BREVO_API_KEY, BREVO_API, or Brevo_API');
          console.warn('⚠️  Email sending will be disabled');
        } else if (!process.env.EMAIL_USER) {
          console.warn('⚠️  EMAIL_USER not configured; email sending will fail');
        } else {
          console.log('📧 Checking Brevo API connectivity...');
          
          // Test API connection
          fetch('https://api.brevo.com/v3/account', {
            method: 'GET',
            headers: {
              'api-key': apiKey,
              'Accept': 'application/json'
            }
          })
            .then(async (response) => {
              if (response.ok) {
                console.log('✅ Brevo API connected successfully');
                console.log(`   📧 API Base URL: https://api.brevo.com/v3`);
                console.log(`   📧 From Address: ${process.env.EMAIL_USER}`);
                
                // Check daily email limit configuration
                const dailyLimit = process.env.DAILY_EMAIL_LIMIT;
                if (dailyLimit) {
                  console.log(`   ⚙️  Daily Email Limit: ${dailyLimit} emails/day`);
                } else {
                  console.warn('   ⚠️  DAILY_EMAIL_LIMIT not set; using default 200');
                }
              } else if (response.status === 401) {
                console.error('❌ Brevo API authentication failed: Invalid API key');
                console.error('   💡 Check your BREVO_EMAIL_API, BREVO_API_KEY, BREVO_API, or Brevo_API key');
              } else {
                console.warn(`⚠️  Brevo API connection test returned status ${response.status}`);
                console.warn('   💡 Email sending may still work. Please verify your API key.');
              }
            })
            .catch(err => {
              console.error('❌ Brevo API connection failed:', err.message || err.toString());
              console.error('   💡 Check your network connectivity and API key');
            });
        }
      } else {
        console.warn(`⚠️  Invalid EMAIL_SENDER value: "${emailSender}". Falling back to AWS SES.`);
      }
    } catch (err) {
      console.warn('⚠️  Failed to initialize email provider connectivity check:', err && err.message ? err.message : err);
    }

    // Start listening
    server.listen(PORT, () => {
      console.log('');
      console.log('🚀 ========================================');
      console.log('🚀  UNITE Backend Server Started');
      console.log('🚀 ========================================');
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Server running on: http://localhost:${PORT}`);
      console.log(`📡 API endpoints: http://localhost:${PORT}/api`);
      console.log(`❤️  Health check: http://localhost:${PORT}/health`);
      console.log(`🔒 CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
      console.log('🚀 ========================================');
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit process in production
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Start the server (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;

