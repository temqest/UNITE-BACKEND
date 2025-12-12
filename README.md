# UNITE Backend

**UNITE Blood Bank Event Management System - Backend API**

## Overview

UNITE is a comprehensive backend system designed to streamline the planning, approval, scheduling, and monitoring of blood-related activities for the Bicol Medical Center Blood Bank. The system centralizes event requests, admin workflows, scheduling rules, and event tracking to maintain an organized and capacity-safe operations pipeline. checking

## Architecture

Built with **Node.js** and **Express.js**, the backend follows a modular, layered architecture:

- **Models**: MongoDB schemas using Mongoose (Users, Events, Requests, Notifications, Chat)
- **Controllers**: Request handlers that process HTTP requests
- **Services**: Business logic layer handling core functionality
- **Routes**: RESTful API endpoints organized by feature
- **Middleware**: Authentication, authorization, and rate limiting
- **Validators**: Input validation using Joi

## Core Features

### Event Management
- **Event Categories**: Blood Drives, Advocacy, Training
- **Calendar Views**: Day, week, and month views with filtering
- **Event Statistics**: Comprehensive analytics and reporting
- **Staff Assignment**: Assign staff members to events

### Request Workflow
- **State Machine**: Robust request approval workflow with double-confirmation
- **Scheduling Rules**: Automatic validation (max events per day, blood bag limits, weekend restrictions)
- **Multi-Role Support**: Coordinators, Admins, and Stakeholders with role-based permissions
- **Request History**: Complete audit trail of all request actions

### Real-Time Communication
- **WebSocket Chat**: Socket.IO-based real-time messaging
- **Presence System**: Online/offline/idle status tracking
- **Typing Indicators**: Real-time typing status
- **Message Notifications**: In-app notifications for new messages

### User Management
- **Role-Based Access**: System Admins, Coordinators, and Stakeholders
- **Registration Codes**: Controlled user registration system
- **Profile Management**: User profiles with district assignments

### Inventory Management
- **Blood Bag Tracking**: Create, update, and manage blood bag inventory
- **Blood Bag Requests**: Request and fulfill blood bag requests between users

### Notifications
- **Multi-Type Notifications**: Request updates, admin actions, coordinator actions, chat messages
- **Read Status Tracking**: Unread count and mark-as-read functionality

### Location Management
- **Hierarchical Locations**: Provinces → Districts → Municipalities
- **Signup Requests**: Public signup requests for new locations

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-Time**: Socket.IO
- **Validation**: Joi
- **Security**: bcrypt for password hashing, CORS, rate limiting
- **Utilities**: node-cache, compression, uuid

## API Structure

All API endpoints are prefixed with `/api`:

- `/api/auth` - Authentication endpoints
- `/api/users` - User management
- `/api/events` - Event operations
- `/api/requests` - Request workflow
- `/api/chat` - Real-time chat
- `/api/inventory` - Blood bag inventory
- `/api/utility` - Notifications, districts, locations

## Security

- JWT-based authentication with token verification
- Role-based access control (RBAC)
- Password hashing with bcrypt
- CORS configuration for allowed origins
- Security headers (XSS protection, frame options)
- Rate limiting (configurable)
- Input validation on all endpoints

## Getting Started

1. Install dependencies: `npm install`
2. Configure environment variables (`.env` file)
3. Start the server: `npm start` or `npm run dev` for development
4. Server runs on `http://localhost:3000` (configurable via PORT)

## Environment Variables

Required environment variables:

`MONGODB_URI` – Connection string for your MongoDB database, used by the backend to establish a secure database connection.

`MONGO_DB_NAME` – Name of the specific MongoDB database your application will use.

`JWT_SECRET` – Secret key used to sign and verify JSON Web Tokens for authentication.

`NODE_ENV` – Specifies the environment the application is running in (development or production) to enable environment-specific behavior.

`ALLOWED_ORIGINS` – Comma-separated list of frontend URLs allowed to access the backend via CORS, preventing unauthorized cross-origin requests.

`EMAIL_USER` – Email address or username used by the backend to authenticate with the SMTP server for sending emails.

`EMAIL_PASS` – Password or application-specific password for the email account defined in EMAIL_USER.

`EMAIL_PORT` – Port number used by the SMTP service (commonly 465 or 587) for sending emails.

`REDIS_URL` – Connection string for your Redis instance, used for caching, session storage, or other fast in-memory data operations.

## Health Check

The server provides a health check endpoint at `/health` to verify server and database connectivity.

---

**Version**: 1.0.0  
**License**: ISC

