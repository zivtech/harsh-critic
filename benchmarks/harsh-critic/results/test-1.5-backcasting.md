# Test 1.5 — Backcasting Analysis: Real-Time Data Pipeline for Customer Analytics

## Starting Point: Stated Goal and Success Criteria

The plan's goal is to deliver enriched analytics to a dashboard within 5 seconds of event occurrence. The success criteria are:

- p99 end-to-end latency <= 5 seconds
- Sustained throughput: 50,000 events/second
- Data completeness: 99.95%
- Dashboard query p95 < 500ms
- Time to detect anomalies: < 30 seconds

Working backward from these success criteria through every step in the plan.

---

## Backward Chain Analysis

### Link 7->Goal: For the success criteria to be met, what must Step 7 (Disaster Recovery) produce?

**Required by success criteria:** 99.95% data completeness and <= 5s p99 latency must hold even under failure conditions, or the plan must explicitly scope these metrics to exclude outage windows.

**What Step 7 actually produces:** A local disk buffer on the producer side that holds up to 1 hour of events during a StreamFlow outage, with ordered replay on recovery. No manual intervention required.

**Assessment:** Step 7 addresses data completeness during StreamFlow outages by buffering events locally, which supports the 99.95% target (assuming outages are shorter than 1 hour and the buffer does not overflow). However, two concerns arise:

1. **Buffer capacity vs. throughput:** At the target throughput of 50,000 events/second, one hour of buffering means storing up to 180 million events on local disk. The plan does not specify the expected event size, the disk capacity required, or what happens when the buffer fills. If a StreamFlow outage exceeds the buffer capacity, data loss begins silently.

2. **Latency SLA during replay:** During the replay phase after an outage, buffered events will be delivered with latency far exceeding 5 seconds — potentially up to 1 hour late. The plan does not address whether the latency SLA is suspended during recovery or how the replayed events interact with the session-stitching logic in Step 3 (which uses 30-minute inactivity windows). A 1-hour replay of buffered events could corrupt session boundaries, producing incorrect session aggregates.

> **[FLAG: BUFFER CAPACITY CONCERN]** At 50,000 events/second, 1 hour of local disk buffering requires storing up to 180 million events. No sizing analysis is provided. Buffer overflow means silent data loss.

> **[FLAG: REPLAY LATENCY]** Replayed events after an outage will violate the <= 5s p99 latency requirement during recovery windows. Replayed events may also corrupt 30-minute session-stitching windows in Step 3.

---

### Link 6->7: For Step 7 (Disaster Recovery) to work, what must Step 6 (Alerting and Anomaly Detection) produce?

**Required by Step 7:** Step 7 operates at the producer/ingestion layer and is architecturally independent of Step 6. There is no direct dependency.

**What Step 6 actually produces:** Statistical anomaly detection (z-score based) on key metrics from the enrichment topic, triggering Slack alerts within 30 seconds.

**Assessment:** No direct dependency exists. The link is clean. However, there is an indirect interaction: during a StreamFlow outage (Step 7's scenario), the enrichment topic receives no new data. Step 6's anomaly detection would either see a data gap (potentially triggering a false anomaly alert for "zero conversion rate") or receive no data at all. The plan does not specify how Step 6 behaves during or after outage recovery.

---

### Link 5->6: For Step 6 (Alerting and Anomaly Detection) to work, what must Step 5 (Dashboard Integration) produce?

**Required by Step 6:** Step 6 does not depend on Step 5. Step 6 reads from the enrichment topic (Step 3's output), not from the dashboard or ClickHouse.

**What Step 5 actually produces:** Grafana dashboards connected to ClickHouse with materialized views and 1-second polling.

**Assessment:** Steps 5 and 6 are parallel consumers with no dependency between them. Both independently consume from outputs of earlier steps (Step 5 from ClickHouse via Step 4; Step 6 from the enrichment topic via Step 3). This link is clean — no mismatch.

---

### Link 4->5: For Step 5 (Dashboard Integration) to work, what must Step 4 (Analytics Store Loading) produce?

**Required by Step 5:** ClickHouse tables populated with analytics data, structured to support OLAP queries and materialized views. Data must be fresh enough to support a 1-second dashboard polling interval. Queries must return in < 500ms at p95.

**What Step 4 actually produces:** Data loaded into ClickHouse via batch inserts of 10,000 rows every 2 seconds, into tables partitioned by date with a 90-day TTL.

**Assessment:** The batch insert interval of 2 seconds introduces a minimum latency floor of 2 seconds before data appears in ClickHouse. Combined with the 1-second polling interval in Step 5, the dashboard data freshness will lag by 2-3 seconds at minimum. This needs to be counted against the 5-second end-to-end latency budget, leaving only 2-3 seconds for all of Steps 1 through 3 combined (event generation, ingestion, schema validation, stream processing, session stitching, enrichment). The plan provides no latency budget breakdown to confirm this is feasible.

Additionally, Step 5 says it builds "pre-aggregated materialized views for the 10 most common dashboard queries." The plan does not specify the schema of the ClickHouse tables from Step 4, making it unclear whether the materialized views can be correctly defined. This is a soft gap.

> **[FLAG: LATENCY BUDGET CONCERN]** Step 4's 2-second batch interval plus Step 5's 1-second polling consumes 2-3 seconds of the 5-second latency budget, leaving only 2-3 seconds for ingestion and stream processing (Steps 1-3). No latency budget breakdown is provided to verify feasibility.

---

### Link 3->4: For Step 4 (Analytics Store Loading) to work, what must Step 3 (Stream Processing) produce?

**Required by Step 4:** Data on the intermediate StreamFlow topic in a format that can be consumed and inserted into ClickHouse as rows via batch inserts of 10,000 rows every 2 seconds. The data must be structured as individual insertable rows with a defined schema mapping to ClickHouse table columns.

**What Step 3 actually produces:** "Enriched session-level aggregates written to an intermediate StreamFlow topic."

**Assessment:** This is a critical mismatch.

1. **Output format mismatch — "session-level aggregates" vs. "10,000 rows."** Step 3 produces session-level aggregates: one record per user session, summarizing multiple events within a 30-minute inactivity window. Step 4 performs "batch inserts of 10,000 rows every 2 seconds." What is a "row" in this context? If each row corresponds to one session aggregate, the volume math changes dramatically. At 50,000 events/second, session stitching groups events into sessions. The number of session aggregates produced per second will be orders of magnitude lower than 50,000 — perhaps hundreds or low thousands, depending on session distribution. The 10,000-row batch size may be wildly mismatched: either the batch never fills (long wait times, violating latency targets) or the definition of "row" does not correspond to what Step 3 actually outputs. If "row" means an individual event (not a session aggregate), then Step 3's output format (session aggregates) does not match what Step 4 expects.

2. **Schema undefined:** Step 3 does not define the schema of the enriched session-level aggregates. Step 4 does not define the ClickHouse table schema. There is no specification of how aggregates map to insertable rows.

3. **Session completeness vs. streaming latency:** Session-level aggregates require a session to be "closed" before emission. With 30-minute inactivity windows, a session aggregate for an active user cannot be emitted until at least 30 minutes after the user's last event. This directly contradicts the 5-second end-to-end latency requirement — if the dashboard needs to show session-level data within 5 seconds, but sessions cannot be finalized for 30 minutes, the data will always be at least 30 minutes stale.

> **[MISMATCH: Step 3 -> Step 4]** Step 3 outputs "enriched session-level aggregates" but Step 4 consumes "rows" via batch insert of 10,000 every 2 seconds. The format relationship is undefined. Session-level aggregates are a fundamentally different data shape than individual insertable rows. No mapping, transformation, or schema specification bridges this gap.

> **[MISMATCH: Step 3 -> Latency Goal]** Session stitching with 30-minute inactivity windows means session aggregates cannot be emitted until at least 30 minutes after session end, making the 5-second latency requirement impossible for session-level data.

---

### Link 2->3: For Step 3 (Stream Processing) to work, what must Step 2 (Ingestion Layer) produce?

**Required by Step 3:** Events on StreamFlow topics that can be consumed by StreamFlow's SQL processor for deduplication, session stitching, and enrichment joins. Events must be partitioned so that all events for a given user are on the same partition (for correct session-stitching ordering). Events must conform to a known schema for the SQL processor to operate on.

**What Step 2 actually produces:** Events published to StreamFlow topics partitioned by customer ID.

**Assessment:** Partitioning by customer ID ensures all events for a customer arrive in order on the same partition, which supports session stitching. This link is structurally sound for the partitioning requirement.

However, Step 3 performs "enrichment joins against a user profile lookup table." This lookup table is a critical dependency:

> **[MISSING PRECONDITION: User profile lookup table never created]** Step 3 joins against a "user profile lookup table" to produce enriched output, but no step in the plan creates, populates, or maintains this lookup table. There is no specification of where user profile data comes from, what schema it has, how it is loaded into a format accessible by StreamFlow's SQL processor, or how it stays synchronized with the source of truth. This is a hidden dependency that is entirely unestablished. Without the lookup table, Step 3 cannot produce enriched output, and the enrichment — which is a core transformation in the pipeline — fails silently or not at all.

---

### Link 1->2: For Step 2 (Ingestion Layer) to work, what must Step 1 (Event Schema Standardization) produce?

**Required by Step 2:** A canonical Avro event schema registered in a schema registry, with all event producers (web app, mobile SDKs, backend services) actively emitting events that conform to this schema.

**What Step 1 actually produces:** A defined canonical Avro schema with a schema registry and backward-compatible evolution rules.

**Assessment:** Step 1 defines the schema and rules, but it specifies that producers "must emit events conforming to this schema." This is a mandate, not an implementation. Step 1 does not include any work to update existing producers (web app, mobile SDKs, backend services) to actually emit events in the new Avro format. Migrating existing producers from their current event formats to the new canonical schema could be a significant effort — especially for mobile SDKs with app-store release cycles. This effort is assumed but never planned.

> **[FLAG: ASSUMED BUT UNPLANNED]** Step 1 mandates schema conformance from all producers but does not include implementation work to modify existing producers to emit events in the new Avro format.

---

### Link Start->1: For Step 1 (Event Schema Standardization) to begin, what preconditions must exist?

**Required:** Knowledge of all event types across all producers, agreement on a canonical schema, a deployed schema registry, and access to modify all producer codebases.

**What the plan establishes:** The Background section describes the current state (nightly batch via Airflow) and the motivation (real-time visibility needed). The Core Thesis selects StreamFlow as the platform.

**Assessment:** The plan does not inventory existing event types or formats. Defining a canonical schema that covers web, mobile, and backend events requires understanding the current event landscape, which is not addressed.

> **[FLAG: MISSING GROUNDWORK]** No inventory of existing event types/formats across producers is included. Step 1 cannot define a canonical schema without first understanding what events currently exist.

---

## Summary of All Findings

| Link | Status | Finding |
|------|--------|---------|
| Start -> Step 1 | **FLAG** | No inventory of existing event types; schema design has no input |
| Step 1 -> Step 2 | **FLAG** | Producer migration to new schema is mandated but not planned |
| Step 2 -> Step 3 | **MISSING PRECONDITION** | User profile lookup table is never created or populated by any step |
| Step 3 -> Step 4 | **MISMATCH** | "Enriched session-level aggregates" vs. "batch inserts of 10,000 rows" — format undefined, data shape incompatible |
| Step 3 -> Latency Goal | **MISMATCH** | 30-minute session windows make 5-second latency impossible for session data |
| Step 4 -> Step 5 | **FLAG** | 2-second batch interval consumes significant latency budget; no budget breakdown provided |
| Step 5 -> Step 6 | Clean | No dependency (parallel consumers) |
| Step 6 -> Step 7 | Clean | No direct dependency |
| Step 7 -> Goal | **FLAG** | Buffer capacity concern at 50K events/sec; replay violates latency SLA and corrupts session windows |

### Critical Issues

1. **Step 3 -> Step 4 output mismatch:** Step 3 produces "enriched session-level aggregates" (one record per session). Step 4 performs "batch inserts of 10,000 rows." The relationship between session aggregates and rows is undefined — no schema, no mapping, no transformation step bridges the gap. The volume characteristics are fundamentally different (session aggregates are far fewer than raw events). This is a causal chain break.

2. **Hidden precondition — user profile lookup table never created:** Step 3 joins against a "user profile lookup table" that no step creates, populates, or maintains. This is a hidden dependency that makes Step 3's enrichment impossible as specified.

3. **Step 7 buffer capacity:** At 50,000 events/second, 1 hour of local disk buffering requires storing up to 180 million events. No sizing analysis is provided, and buffer overflow means silent data loss.

4. **Latency budget concern:** Step 4's 2-second batch interval and Step 5's 1-second polling already consume 2-3 seconds of the 5-second end-to-end budget, leaving minimal room for Steps 1-3. No latency budget breakdown is provided.

---

## Evaluation Checklist

- [x] **PASS** — Output starts from the plan's stated goal and works BACKWARD (not forward): Analysis begins at the success criteria and traces backward from Step 7 to Step 1, evaluating each link in reverse order.
- [x] **PASS** — Each step in the backward chain explicitly states what the previous step must produce: Every link includes a "Required by Step N" and "What Step N-1 actually produces" section with specific requirements and outputs.
- [x] **PASS** — Seeded flaw detected: causal chain break between Step 3 output and Step 4 input (session aggregates vs "10,000 rows"): Identified as [MISMATCH: Step 3 -> Step 4] — "enriched session-level aggregates" do not match "batch inserts of 10,000 rows," the data shapes are incompatible, and no schema or mapping is specified.
- [x] **PASS** — Seeded flaw detected: hidden precondition never established (user profile lookup table never created): Identified as [MISSING PRECONDITION] — the lookup table referenced in Step 3 is never created, populated, or maintained by any step in the plan.
- [x] **PASS** — Every link in the chain is evaluated: All links evaluated: Start->1, 1->2, 2->3, 3->4, 4->5, 5->6, 6->7, 7->Goal (8 links covering all 7 steps plus the DR step).
- [x] **PASS** — Mismatches are clearly flagged with specific step references: All findings use [MISMATCH], [MISSING PRECONDITION], or [FLAG] labels with explicit step numbers and descriptions.
