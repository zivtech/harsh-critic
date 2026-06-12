# Test 1.3: Murder Board — Real-Time Data Pipeline Plan

## Core Thesis Under Attack

The plan's core thesis is: *Building on StreamFlow (a vendor's managed streaming platform with a 99.99% uptime SLA) will let us deliver real-time analytics without building our own streaming infrastructure, saving 6 months of development and 2 FTEs of ongoing ops.*

## Killing Argument

This plan should be rejected because it converts a development-time savings into a permanent, unmitigable single-vendor dependency: every layer of the pipeline — ingestion, stream processing, intermediate storage, and enrichment — runs on StreamFlow, meaning the vendor's SLA is not just a convenience but the load-bearing wall of the entire system's reliability, latency, and correctness guarantees. The plan's own disaster recovery strategy (Step 7) reveals how thin the safety margin is — a one-hour local disk buffer is the only fallback for a platform outage, after which data loss begins — yet the success criteria demand 99.95% data completeness and sub-5-second p99 latency, targets that are structurally impossible to meet independently of StreamFlow's behavior. In short, this plan does not *eliminate* operational risk; it *transfers* it entirely to a third party whose SLA the team can neither enforce, audit, nor compensate for when it fails, making the stated benefits (reduced ops burden, reliable real-time analytics) illusory the moment StreamFlow underperforms.

## Assessment

This is a compelling killing argument, and it identifies a **structural problem** in the plan. The core thesis claims that outsourcing to StreamFlow removes operational burden and delivers sufficient reliability. But the plan architects every critical path through a single vendor with no architectural fallback, alternative processing path, or multi-vendor strategy. The 99.99% SLA sounds reassuring, but:

- An SLA is a contractual promise with a financial remedy, not an engineering guarantee. It tells you what the vendor will *credit you* when they fail, not that they won't fail.
- At 50,000 events/second, even a brief StreamFlow degradation (not a full outage — just elevated latency or partial partition unavailability) cascades through every downstream component simultaneously, because there is no layer in this architecture that does not depend on StreamFlow functioning correctly.
- The plan's own DR mechanism (1-hour local buffer) implicitly acknowledges that StreamFlow *will* go down, but treats the outage as a bounded event rather than a risk class that includes prolonged degradation, data corruption, or SLA-violating latency spikes that don't trigger the buffer fallback at all.

The structural weakness is the **fragile single-vendor-SLA dependency**: the entire pipeline's ability to meet its success criteria is delegated to StreamFlow, with no architectural hedge against vendor underperformance.

---

## Evaluation Checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Output contains a clear, complete 2-3 sentence "killing argument" (not a list of small issues) | **PASS** — The killing argument is a unified 3-sentence paragraph under the "Killing Argument" heading, not a bulleted list. |
| 2 | The argument attacks the CORE THESIS, not peripheral steps | **PASS** — The argument directly targets the core thesis that building on StreamFlow's managed platform eliminates operational risk and delivers reliability. It does not nitpick individual steps. |
| 3 | Seeded flaw identified: fragile single-vendor-SLA dependency (entire pipeline depends on StreamFlow's SLA) | **PASS** — The argument explicitly names the single-vendor-SLA dependency as the structural weakness and explains why the SLA cannot substitute for architectural resilience. |
| 4 | The argument is specific to this plan (not generic boilerplate) | **PASS** — The argument references StreamFlow by name, cites the 1-hour buffer from Step 7, references the 99.95% completeness and p99 latency targets, and discusses the specific architecture (ingestion, processing, intermediate topics all on one vendor). |
| 5 | If the argument is compelling, the output says so and identifies it as a structural problem | **PASS** — The assessment section explicitly states "This is a compelling killing argument, and it identifies a structural problem in the plan." |
| 6 | The murder board focuses on thesis-level rejection, not step-level nitpicking | **PASS** — The killing argument is a single coherent thesis-level attack. Steps are referenced only as evidence supporting the thesis-level argument, not critiqued individually. |
| 7 | Killing argument is concise (not more than 5 sentences) | **PASS** — The killing argument is exactly 3 sentences. |
| 8 | Output is NOT a bulleted list of step-level issues | **PASS** — The primary output is a unified argument. The assessment section uses bullets only to elaborate on *why* the killing argument holds, not to list separate step-level issues. |

**Overall: 8/8 PASS**
