# Plan: Real-Time Data Pipeline for Customer Analytics

## Goal
Build a real-time data pipeline that ingests customer events, transforms them, and delivers enriched analytics to the dashboard within 5 seconds of event occurrence. Success criteria: end-to-end latency ≤5 seconds at p99, throughput of 50,000 events/second, 99.95% data completeness, and dashboard refresh rate of 1 second.

## Background
Currently, analytics are batch-processed nightly via Airflow DAGs. Business stakeholders need real-time visibility into customer behavior for time-sensitive campaigns and fraud detection. The nightly batch has a 12-hour data lag that is no longer acceptable.

## Core Thesis
Building on StreamFlow (our vendor's managed streaming platform, which guarantees 99.99% uptime per their SLA) will let us deliver real-time analytics without building and operating our own streaming infrastructure, saving 6 months of development time and 2 FTEs of ongoing ops burden.

## Step 1: Event Schema Standardization
Define a canonical event schema using Avro with a schema registry. All event producers (web app, mobile SDKs, backend services) must emit events conforming to this schema. Schema evolution rules: backward-compatible changes only (add optional fields, never remove or rename).

## Step 2: Ingestion Layer
Deploy StreamFlow collectors at the edge. Events are published to StreamFlow topics partitioned by customer ID for ordering guarantees. Expected ingestion rate: 50,000 events/second with 3x headroom for traffic spikes.

Decision: StreamFlow over self-managed Kafka because StreamFlow's managed offering eliminates operational overhead and their SLA guarantees sufficient uptime for our needs.

## Step 3: Stream Processing
Build transformation jobs using StreamFlow's built-in SQL processor. Transformations include: event deduplication, session stitching (group events by user session using 30-minute inactivity windows), and enrichment joins against a user profile lookup table.

Output: enriched session-level aggregates written to an intermediate StreamFlow topic.

## Step 4: Analytics Store Loading
Read from the intermediate topic and load into ClickHouse for OLAP queries. The loader uses batch inserts of 10,000 rows every 2 seconds to balance latency and throughput. ClickHouse tables are partitioned by date with a TTL of 90 days.

## Step 5: Dashboard Integration
Connect the analytics dashboard (Grafana) directly to ClickHouse. Build pre-aggregated materialized views for the 10 most common dashboard queries to ensure sub-second response times. Live refresh via a 1-second polling interval.

## Step 6: Alerting and Anomaly Detection
Build a secondary consumer on the enrichment topic that runs statistical anomaly detection (z-score based) on key metrics: conversion rate, cart abandonment, and page error rate. Anomalies trigger Slack alerts within 30 seconds of detection.

## Step 7: Disaster Recovery
If StreamFlow experiences an outage, events are buffered in the producer's local disk queue (up to 1 hour of capacity). Once StreamFlow recovers, buffered events are replayed in order. No manual intervention required.

## Success Metrics
- p99 end-to-end latency ≤5 seconds
- Sustained throughput: 50,000 events/second
- Data completeness: 99.95%
- Dashboard query p95 <500ms
- Time to detect anomalies: <30 seconds
