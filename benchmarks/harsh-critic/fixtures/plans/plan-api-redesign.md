# Plan: Redesign Public API from REST v1 to GraphQL

## Goal
Replace the existing REST v1 API with a GraphQL API to improve developer experience and reduce over-fetching. Success criteria: all 47 existing REST endpoints have GraphQL equivalents, external developer migration guide published, REST v1 deprecated within 6 months, and API response payload sizes reduced by 40% on average.

## Background
Our REST v1 API was designed 3 years ago. Since then, our data model has grown significantly. Mobile clients now make 8-12 REST calls to assemble a single screen's data, causing latency and battery drain. Several enterprise customers have requested more flexible querying.

## Core Thesis
GraphQL is the right replacement for our REST API because it solves the over-fetching problem and gives clients control over response shape, which our REST API cannot provide without building dozens of new specialized endpoints.

## Step 1: Schema Design
Design the GraphQL schema mapping all existing resources. Use a schema-first approach with SDL files. The schema will cover: Users, Organizations, Projects, Tasks, Comments, Attachments, and Notifications. Include pagination via Relay-style cursor connections.

Decision: We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority over REST for complex data models.

## Step 2: Resolver Implementation
Implement resolvers for all types using a DataLoader pattern to prevent N+1 queries. Resolvers will delegate to existing service layer classes, so business logic is not duplicated. Estimated effort: 3 developers for 4 weeks.

## Step 3: Authentication and Authorization
Reuse existing OAuth2 token validation middleware. For field-level authorization, implement a directive-based approach (`@auth(requires: ADMIN)`) that checks permissions before resolving sensitive fields.

Decision: We chose directive-based field auth over resolver-level checks because directives keep auth logic visible in the schema rather than buried in code.

## Step 4: Performance Optimization
Implement query complexity analysis to prevent abusive queries. Set a complexity budget of 1000 points per query. Add persistent query support (allowlisted query hashes) for production clients. Enable response caching at the CDN layer using `Cache-Control` headers derived from query complexity and data volatility.

## Step 5: Developer Migration Support
Publish a migration guide mapping each REST endpoint to its GraphQL equivalent. Build a REST-to-GraphQL proxy that translates incoming REST calls to GraphQL queries, allowing existing integrations to work without code changes during the transition period.

## Step 6: Deprecation Timeline
- Month 1-2: GraphQL API in beta alongside REST v1
- Month 3-4: GraphQL GA; REST v1 marked deprecated with sunset headers
- Month 5-6: REST v1 returns 410 Gone for unmigrated clients

## Success Metrics
- All 47 REST endpoints have GraphQL equivalents
- Average response payload size reduced by 40%
- External developer satisfaction score ≥4.0/5.0
- REST v1 traffic <5% by month 4
