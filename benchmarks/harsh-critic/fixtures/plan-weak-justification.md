# Plan: Rewrite Notification System in Rust

## Goal
Rewrite the existing Node.js notification service in Rust to improve performance and reliability. Success criteria: notification delivery latency reduced by 50%, memory usage reduced by 70%, and zero unplanned downtime in production.

## Background
The notification service sends push notifications, emails, and SMS messages to users. It currently processes about 2,000 notifications per minute. Occasionally during peak hours, the Node.js process experiences garbage collection pauses that delay notifications by up to 3 seconds.

## Core Thesis
Rust is the right language for this rewrite because it's fast and memory-safe.

## Step 1: Set Up Rust Project
Initialize a new Rust project using Cargo. Set up the project structure with modules for each notification channel (push, email, SMS). Use the Actix-web framework for the HTTP API.

Decision: We chose Actix-web because it's the fastest Rust web framework according to TechEmpower benchmarks.

## Step 2: Implement Core Notification Router
Build the routing logic that receives notification requests and dispatches them to the appropriate channel handler. Use Tokio for async runtime. The router reads from a RabbitMQ queue (same as the current Node.js service).

Decision: We are keeping RabbitMQ rather than switching to Kafka because we already use RabbitMQ.

## Step 3: Implement Channel Handlers
Build handlers for each notification channel:
- **Push**: Use the `fcm` crate for Firebase Cloud Messaging and `a2` crate for Apple Push Notification Service
- **Email**: Use the `lettre` crate to send via our existing SendGrid SMTP relay
- **SMS**: Use `reqwest` to call the Twilio API

Each handler implements a common `NotificationSender` trait with `send()` and `check_status()` methods.

## Step 4: Database Migration
Migrate the notification log from MongoDB to PostgreSQL. All notification events (sent, delivered, failed, retried) are logged for compliance and debugging. Use Diesel ORM for database access.

Decision: PostgreSQL over MongoDB because SQL databases are better for structured data.

## Step 5: Deploy to Production
Build a Docker container for the Rust service. Deploy alongside the existing Node.js service. Use a feature flag to route 10% of traffic to the Rust service, increasing to 100% over 2 weeks.

## Step 6: Decommission Node.js Service
After 100% traffic is on the Rust service for 1 week with stable metrics, shut down the Node.js service and remove it from the deployment pipeline. Archive the Node.js repository.

## Success Metrics
- Notification delivery latency p99: <500ms (currently ~1,200ms)
- Memory usage: <128MB (currently ~450MB)
- Zero unplanned downtime for 30 days post-migration
- All notification channels functional at 100% delivery rate
