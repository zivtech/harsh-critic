# Test 1.5 — Backcasting Analysis: Real-Time Data Pipeline for Customer Analytics

## Starting Point: Stated Goal and Success Criteria

The plan's goal is to deliver enriched analytics to a dashboard within 5 seconds of event occurrence. The success criteria are:

- p99 end-to-end latency ≤ 5 seconds
- Sustained throughput: 50,000 events/second
- Data completeness: 99.95%
- Dashboard query p95 < 500ms
- Time to detect anomalies: < 30 seconds

Working backward from these success criteria through every step in the plan.

---

## Backward Chain Analysis

### Link 7→Goal: For the success criteria to be met, what must Step 7 (Disaster Recovery) produce?

**Required by success criteria:** 99.95% data completeness and ≤ 5s p99 latency even under failure conditions.

**What Step 7 actually produces:** A local disk buffer on the producer side that holds up to 1 hour of events during a StreamFlow outage, with ordered replay on recovery.

**Assessment:** Step 7 addresses data completeness during StreamFlow outages, which supports the 99.95% target. However, during the replay phase after an outage, events that were buffered will be delivered with latency far exceeding 5 seconds (potentially up to 1 hour late). The plan does not address whether the latency SLA is suspended during recovery or how replayed events interact with the session-stitching logic in Step 3 (which uses 30-minute inactivity windows — a 1-hour buffer replay could break session boundaries).

> **[FLAG: UNADDRESSED INTERACTION]** Step 7's replay of buffered events will violate the ≤ 5s p99 latency requirement during recovery windows. Additionally, replayed events arriving out of their original time context will corrupt the 30-minute session-stitching windows in Step 3.

---

### Link 6→7: For Step 7 (Disaster Recovery) to work, what must Step 6 (Alerting and Anomaly Detection) produce?

**Required by Step 7:** Step 7 is architecturally independent of Step 6 — it operates at the producer/ingestion layer, not the alerting layer. There is no direct dependency.

**What Step 6 actually produces:** Slack alerts triggered by anomaly detection on the enrichment topic.

**Assessment:** No direct dependency, but there is a gap: Step 6 consumes from the "enrichment topic" (Step 3's output). During a StreamFlow outage (Step 7's scenario), the enrichment topic receives no new data, so anomaly detection would have no signal. The plan does not describe how Step 6 behaves during or after outage recovery — stale data could trigger false anomalies during replay.

> **[FLAG: MISSING BEHAVIOR SPEC]** Step 6 has no defined behavior for outage/recovery scenarios handled by Step 7. False anomaly alerts are likely during event replay.

---

### Link 5→6: For Step 6 (Alerting and Anomaly Detection) to work, what must Step 5 (Dashboard Integration) produce?

**Required by Step 6:** Step 6 does not depend on Step 5 at all. Step 6 reads from the "enrichment topic" (the intermediate StreamFlow topic from Step 3), not from the dashboard or ClickHouse.

**What Step 5 actually produces:** Grafana dashboards connected to ClickHouse with materialized views and 1-second polling.

**Assessment:** Steps 5 and 6 are parallel consumers with no dependency between them. This link is clean — no mismatch. Both independently consume from outputs of earlier steps (Step 5 from Step 4's ClickHouse tables; Step 6 from Step 3's enrichment topic).

---

### Link 4→5: For Step 5 (Dashboard Integration) to work, what must Step 4 (Analytics Store Loading) produce?

**Required by Step 5:** ClickHouse tables populated with analytics data, structured in a way that supports OLAP queries and materialized views. Data must be fresh enough to support a 1-second dashboard polling interval, and queries must return in < 500ms at p95.

**What Step 4 actually produces:** Data loaded into ClickHouse via batch inserts of 10,000 rows every 2 seconds, into tables partitioned by date with a 90-day TTL.

**Assessment:** The batch insert interval of 2 seconds introduces a minimum latency floor of 2 seconds before data appears in ClickHouse. Combined with the 1-second polling interval in Step 5, the dashboard data freshness will lag by 2–3 seconds. This needs to be counted against the 5-second end-to-end latency budget, leaving only 2–3 seconds for Steps 1–3 combined. The plan does not provide a latency budget breakdown to confirm this is feasible.

Additionally, Step 5 says it builds "pre-aggregated materialized views for the 10 most common dashboard queries." The plan does not specify the schema of the ClickHouse tables from Step 4, so it is unclear whether the materialized views can be correctly defined. This is a soft gap rather than a hard mismatch.

> **[FLAG: LATENCY BUDGET CONCERN]** Step 4's 2-second batch interval plus Step 5's 1-second polling consumes 2–3 seconds of the 5-second latency budget, leaving only 2–3 seconds for ingestion and stream processing. No latency budget breakdown is provided.

---

### Link 3→4: For Step 4 (Analytics Store Loading) to work, what must Step 3 (Stream Processing) produce?

**Required by Step 4:** Data on the intermediate StreamFlow topic in a format that can be consumed and inserted into ClickHouse as rows via batch inserts of 10,000 rows every 2 seconds. The data must be structured as individual insertable rows with a defined schema that maps to ClickHouse table columns.

**What Step 3 actually produces:** "Enriched session-level aggregates written to an intermediate StreamFlow topic."

**Assessment:** This is a critical mismatch.

1. **Format mismatch — "session-level aggregates" vs. "rows":** Step 3 outputs session-level aggregates (i.e., one record per user session, summarizing multiple events). Step 4 performs "batch inserts of 10,000 rows." What is a "row" in this context? If each row corresponds to one session aggregate, the volume math changes drastically: 50,000 events/second reduced through session stitching would produce far fewer session aggregates per second, so the 10,000-row batch size and 2-second cadence may be wildly mismatched to actual throughput. If each row corresponds to an original event (not a session aggregate), then Step 3's output format does not match what Step 4 expects to insert.

2. **Schema undefined:** Step 3 does not define the schema of the session-level aggregates. Step 4 does not define the ClickHouse table schema. There is no specification of how the aggregate format maps to insertable rows.

3. **Aggregate completeness vs. streaming:** Session-level aggregates require a session to be "closed" (30-minute inactivity window) before they can be emitted. This means Step 3 cannot emit a session aggregate until at least 30 minutes after the last event in that session. This directly contradicts the 5-second end-to-end latency requirement — a session aggregate for an active user session will not be produced for at least 30 minutes.

> **[MISMATCH: Step 3 → Step 4]** Step 3 outputs "enriched session-level aggregates" but Step 4 consumes "rows" via batch insert. The format relationship is undefined. "Session-level aggregates" are a fundamentally different data shape than individual insertable rows. No mapping or transformation between these formats is specified.

> **[MISMATCH: Step 3 → Latency Goal]** Session stitching with 30-minute inactivity windows means session aggregates cannot be emitted until 30 minutes after the session ends, making the 5-second latency requirement impossible for session-level data.

---

### Link 2→3: For Step 3 (Stream Processing) to work, what must Step 2 (Ingestion Layer) produce?

**Required by Step 3:** Events on StreamFlow topics that can be consumed by StreamFlow's SQL processor for deduplication, session stitching, and enrichment joins. Events must be partitioned in a way that supports session stitching (i.e., all events for a given user must be on the same partition for correct ordering). Events must conform to a known schema for the SQL processor to operate on.

**What Step 2 actually produces:** Events published to StreamFlow topics partitioned by customer ID.

**Assessment:** Partitioning by customer ID ensures all events for a customer are ordered, which supports session stitching. This link is structurally sound for the partitioning requirement. However:

> **[MISSING PRECONDITION: Step 3]** Step 3 performs "enrichment joins against a user profile lookup table." This lookup table is never created, populated, or maintained by any step in the plan. No step defines where user profile data comes from, what schema it has, how it is loaded into a location accessible by StreamFlow's SQL processor, or how it is kept up to date. This is a hidden dependency that is entirely unestablished.

The join in Step 3 is a core transformation (enrichment), and without the lookup table, Step 3 cannot produce enriched output. This is a critical gap.

---

### Link 1→2: For Step 2 (Ingestion Layer) to work, what must Step 1 (Event Schema Standardization) produce?

**Required by Step 2:** A canonical Avro event schema registered in a schema registry, with all event producers (web app, mobile SDKs, backend services) actively emitting events that conform to this schema.

**What Step 1 actually produces:** A defined canonical Avro schema with a schema registry and backward-compatible evolution rules.

**Assessment:** Step 1 defines the schema and rules, but it specifies that producers "must emit events conforming to this schema." This is a mandate, not an implementation. Step 1 does not include any implementation work to update the existing producers (web app, mobile SDKs, backend services) to actually emit events in the new format. Migration of existing producers from their current event formats to the new canonical schema is a significant effort that is assumed but never planned.

> **[FLAG: ASSUMED BUT UNPLANNED]** Step 1 mandates schema conformance from all producers but does not include implementation work to modify existing producers (web app, mobile SDKs, backend services) to emit events in the new Avro format. This is a potentially large migration effort with no plan.

---

### Link Start→1: For Step 1 (Event Schema Standardization) to begin, what preconditions must exist?

**Required:** Knowledge of all event types across all producers, agreement on a canonical schema, a deployed schema registry, and access to modify all producer codebases.

**What the plan establishes:** The Background section describes the current state (nightly batch via Airflow) and the motivation (need real-time). The Core Thesis selects StreamFlow as the platform.

**Assessment:** The plan does not inventory existing event types or formats. Defining a canonical schema that covers web, mobile, and backend events requires understanding the current event landscape, which is not addressed.

> **[FLAG: MISSING GROUNDWORK]** No inventory of existing event types/formats across producers is included. Step 1 cannot define a canonical schema without first understanding what events currently exist.

---

## Summary of All Findings

| Link | Status | Finding |
|------|--------|---------|
| Start → Step 1 | **FLAG** | No inventory of existing event types; schema design has no input |
| Step 1 → Step 2 | **FLAG** | Producer migration to new schema is mandated but not planned |
| Step 2 → Step 3 | **MISSING PRECONDITION** | User profile lookup table is never created or populated by any step |
| Step 3 → Step 4 | **MISMATCH** | "Enriched session-level aggregates" vs. "batch inserts of 10,000 rows" — format undefined, data shape incompatible |
| Step 3 → Latency Goal | **MISMATCH** | 30-minute session windows make 5-second latency impossible for session data |
| Step 4 → Step 5 | **FLAG** | 2-second batch interval consumes significant latency budget; no budget breakdown |
| Step 5 → Step 6 | Clean | No dependency (parallel consumers) |
| Step 6 → Step 7 | **FLAG** | No defined alerting behavior during outage/recovery |
| Step 7 → Goal | **FLAG** | Replay after outage violates latency SLA; corrupts session windows |

### Critical Issues

1. **Step 3 → Step 4 format mismatch:** Step 3 produces "enriched session-level aggregates" (one record per session). Step 4 performs "batch inserts of 10,000 rows." The term "row" is never defined, the mapping from session aggregates to rows is never specified, and the volume characteristics are fundamentally different. This is a causal chain break.

2. **User profile lookup table never established:** Step 3 joins against a "user profile lookup table" that no step creates, populates, or maintains. This is a hidden precondition that makes Step 3's enrichment impossible as specified.

3. **Session stitching vs. latency SLA:** The 30-minute inactivity window for session stitching means session-level aggregates cannot be emitted in real time, directly contradicting the 5-second end-to-end latency requirement.

---

## Evaluation Checklist

- [x] **PASS** — Output starts from the plan's stated goal and works BACKWARD (not forward): Analysis begins at the success criteria and traces backward from Step 7 to Step 1.
- [x] **PASS** — Each step in the backward chain explicitly states what the previous step must produce: Every link includes a "Required by Step N" and "What Step N-1 actually produces" section.
- [x] **PASS** — Seeded flaw detected: causal chain break between Step 3 output and Step 4 input: Identified that "enriched session-level aggregates" do not match "batch inserts of 10,000 rows" — the term "row" is undefined and the data shapes are incompatible.
- [x] **PASS** — Seeded flaw detected: hidden precondition never established: Identified that the "user profile lookup table" referenced in Step 3 is never created or populated by any step in the plan.
- [x] **PASS** — Every link in the chain is evaluated: All links evaluated: Start→1, 1→2, 2→3, 3→4, 4→5, 5→6, 6→7, 7→Goal (8 links total covering all 7 steps).
- [x] **PASS** — Mismatches are clearly flagged with specific step references: All findings include [MISMATCH], [MISSING PRECONDITION], or [FLAG] labels with explicit step numbers.
