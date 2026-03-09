# External Skills Inventory for zivtech-data-skills

Research conducted 2026-03-08. This document catalogs publicly available Claude Code skills relevant to the **data-critic** (reviewing math/data correctness in code) and the planned **data-planner** (planning data pipelines, analysis approaches, and validation strategies).

For each skill: what it does, whether it's for criticism or planning (or both), what aspects of data work it supports, and whether it requires external connections.

---

## Tier 1 — High-Value Skills (directly applicable)

### verification-before-completion
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Enforces evidence-based completion claims — always run actual verification commands before claiming work is done. "Evidence before claims, always."
- **Use for:** Criticism
- **Aspects:** Verification protocol gate — prevents the data-critic from asserting "formula is correct" without actually running the verification. Also useful for data-planner to ensure each pipeline step is validated.
- **MCP/API:** None (behavioral discipline guide)
- **Cost:** Free

### systematic-debugging
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Four-phase root cause investigation: error analysis → pattern matching → hypothesis testing → implementation. Hard rule: no fixes without root cause first.
- **Use for:** Criticism
- **Aspects:** When the data-critic finds a wrong number, this protocol traces it to root cause instead of guessing. Prevents "the rounding looks wrong" without actually proving which line causes the error.
- **MCP/API:** None
- **Cost:** Free

### test-driven-development
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Red-Green-Refactor cycle — write failing test first, verify it fails, write minimal code to pass, verify green, refactor.
- **Use for:** Both
- **Aspects:** Critical for data-planner when planning numerical implementations: specify expected outputs as tests before writing formulas. For data-critic: verifying that tests actually catch the bugs found (tests-after are biased by implementation).
- **MCP/API:** None
- **Cost:** Free

### statistical-analysis
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Guided statistical analysis with test selection, assumption checking, power analysis, effect sizes, confidence intervals, and APA-formatted reporting. Covers hypothesis tests, regression, correlation, Bayesian testing.
- **Use for:** Both
- **Aspects:** Data-critic uses this to verify statistical methods are correct (right test for the data, assumptions met, correct denominator). Data-planner uses it to design analysis approaches and select appropriate methods.
- **MCP/API:** None (scipy, statsmodels, pingouin, pymc, arviz — all free Python packages)
- **Cost:** Free

### statsmodels
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Statistical modeling — OLS, GLM, discrete choice, time series (ARIMA, SARIMAX, VAR), with comprehensive diagnostics and publication-ready tables.
- **Use for:** Both
- **Aspects:** Data-critic uses the diagnostics (heteroskedasticity, autocorrelation, multicollinearity, influence stats, outlier detection) to verify model assumptions. Data-planner uses it for model specification and comparison (AIC, BIC, LR tests).
- **MCP/API:** None
- **Cost:** Free

### exploratory-data-analysis
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Automatic EDA across 200+ scientific file formats with quality metrics, anomaly detection, distribution analysis, and downstream recommendations.
- **Use for:** Both
- **Aspects:** Data-critic uses quality metrics and anomaly detection to verify data assumptions. Data-planner uses it to understand data shape before designing pipelines.
- **MCP/API:** None (format-specific libraries: Biopython, RDKit, h5py, etc.)
- **Cost:** Free

### csv-data-summarizer
- **Source:** [coffeefuelbump/csv-data-summarizer-claude-skill](https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill)
- **What it does:** Automatic CSV analysis — data type detection, statistical summaries, missing data analysis, multi-type adaptive analysis, visualizations. No options presented, immediate analysis.
- **Use for:** Both
- **Aspects:** Quick data profiling for both critic (verify data assumptions) and planner (understand what you're working with before designing transforms).
- **MCP/API:** None (pandas, matplotlib, seaborn)
- **Cost:** Free

### devils-advocate
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** Multi-turn adversarial debate: Round 1 (Adversarial Critic) → Round 2 (Defense) → Round 3 (Adjudication) → Synthesis with severity ratings. Challenges theoretical foundations, methodology, data selection bias, causal claims.
- **Use for:** Criticism
- **Aspects:** Data-critic uses this to stress-test analysis methodology — are the statistical choices defensible? Are causal claims supported? Is data selection biased? Output uses Critical/Major/Minor/Dismissed severity ratings (aligns with data-critic's own scale).
- **MCP/API:** None (supports optional council mode with multiple LLM providers)
- **Cost:** Free

### multi-perspective
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** Explores questions from 3-5 independent disciplinary perspectives via parallel agent investigation. Produces agreement map, tension map, blind spot detection.
- **Use for:** Both
- **Aspects:** Data-critic uses this for the multi-perspective review phase (data engineer / domain expert / adversarial input). Data-planner uses it to evaluate analysis approaches from different disciplinary angles. Supports anonymized cross-evaluation.
- **MCP/API:** Task tool for parallel agents
- **Cost:** Free

---

## Tier 2 — Strong Supporting Skills

### writing-plans
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Creates comprehensive bite-sized implementation plans with exact file paths, code examples, test commands, and expected outputs.
- **Use for:** Planning
- **Aspects:** Data-planner's core planning engine. Task breakdowns with "write failing test → run → implement → test → commit" rhythm. Exact file paths and expected output.
- **MCP/API:** None
- **Cost:** Free

### executing-plans
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Loads a plan, reviews it critically, executes in batches (default 3 tasks), reports between batches, applies feedback.
- **Use for:** Planning
- **Aspects:** Data-planner's execution engine — batch execution with human checkpoints for architect review. Critical: reviews plan before blind execution.
- **MCP/API:** None
- **Cost:** Free

### brainstorming
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Socratic design refinement: explore context → clarifying questions → 2-3 approaches → design presentation → approval → design doc → transition to writing-plans.
- **Use for:** Planning
- **Aspects:** Data-planner's front door. Before any pipeline or analysis work, brainstorm the approach. Hard gate: no implementation until design is approved.
- **MCP/API:** None
- **Cost:** Free

### subagent-driven-development
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** Execute plans by dispatching fresh subagents per task, with two-stage review (spec compliance then code quality) after each task.
- **Use for:** Both
- **Aspects:** Data-planner uses this for orchestrating multi-step data pipeline implementations. Data-critic can be slotted in as the second-stage reviewer for numerical correctness.
- **MCP/API:** None (orchestration pattern)
- **Cost:** Free

### dispatching-parallel-agents
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** When facing 2+ independent problems, dispatch one agent per domain to investigate/fix in parallel.
- **Use for:** Both
- **Aspects:** Data-critic uses this for parallel verification of independent calculation chains. Data-planner uses it for parallel implementation of independent pipeline stages.
- **MCP/API:** None
- **Cost:** Free

### requesting-code-review / receiving-code-review
- **Source:** [obra/superpowers](https://github.com/obra/superpowers)
- **What it does:** requesting: Dispatch reviewer subagent after task completion. receiving: Technical evaluation protocol — READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT.
- **Use for:** Criticism
- **Aspects:** requesting: Integrates data-critic into the development workflow as the dispatched reviewer. receiving: How to process data-critic feedback — no performative agreement, verify against codebase, push back with technical reasoning.
- **MCP/API:** None
- **Cost:** Free

### code-archaeology
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** Systematically review and understand old code, data pipelines, and analysis files. Documents what exists before modifying. Creates audit reports, README, pipeline maps.
- **Use for:** Both
- **Aspects:** Data-critic uses this to understand legacy calculation logic before reviewing changes. Data-planner uses it to map existing data flows before planning modifications.
- **MCP/API:** None
- **Cost:** Free

### pipeline-manifest
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** Maps research code pipeline: scripts → inputs → outputs → paper figures/tables. Constructs dependency graph, determines execution order, detects orphans.
- **Use for:** Planning
- **Aspects:** Data-planner's pipeline documentation engine. Maps the full data flow for understanding before modifications.
- **MCP/API:** None
- **Cost:** Free

### code-review (research)
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** 11-category scorecard for R and Python research scripts: reproducibility, structure, domain correctness, cross-language verification. Report-only (never edits source).
- **Use for:** Criticism
- **Aspects:** Complements data-critic with research-specific scoring: reproducibility rigor, statistical correctness, methodology validation, data persistence. Supports council mode (multiple LLMs for high-stakes papers).
- **MCP/API:** None
- **Cost:** Free

### senior-data-engineer
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Builds scalable data pipelines, ETL/ELT systems with Python, SQL, Spark, Airflow, dbt, Kafka. Includes Great Expectations data quality framework, data contracts, schema validation.
- **Use for:** Planning
- **Aspects:** Data-planner's pipeline architecture reference — Lambda vs Kappa, batch vs streaming, dbt modeling, data lineage, monitoring patterns.
- **MCP/API:** None (standard toolkit)
- **Cost:** Free

### senior-data-scientist
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Statistical modeling, experimentation, causal inference, advanced analytics. Covers experiment design, A/B testing, feature engineering, model evaluation, production ML deployment.
- **Use for:** Both
- **Aspects:** Data-critic uses the experiment design and A/B testing knowledge to validate methodology. Data-planner uses it for analysis approach design and production deployment patterns.
- **MCP/API:** None
- **Cost:** Free

---

## Tier 3 — Domain-Specific Skills (use when applicable)

### bigquery-pipeline-audit
- **Source:** [github/awesome-copilot](https://github.com/github/awesome-copilot)
- **What it does:** Audit Python + BigQuery pipelines for cost safety, idempotency, and production readiness. PASS/FAIL per section with exact patch locations and cost risk estimates.
- **Use for:** Criticism
- **Aspects:** Data-critic adds this when reviewing BigQuery-specific code: `maximum_bytes_billed` settings, write idempotency (MERGE vs append), partition filters, no SELECT *, loop-based backfill detection.
- **MCP/API:** None (reads code, doesn't connect to BigQuery)
- **Cost:** Free

### sql-code-review
- **Source:** [github/awesome-copilot](https://github.com/github/awesome-copilot)
- **What it does:** Universal SQL review across all databases: security (injection, parameterization), performance (indexes, joins, aggregation), schema design, anti-patterns (N+1, DISTINCT overuse).
- **Use for:** Criticism
- **Aspects:** Data-critic adds this when reviewing SQL-heavy code. Scored assessment across security/performance/maintainability/schema quality with before/after examples.
- **MCP/API:** None
- **Cost:** Free

### postgresql-code-review
- **Source:** [github/awesome-copilot](https://github.com/github/awesome-copilot)
- **What it does:** PostgreSQL-specific review: JSONB, arrays, custom types, CITEXT, TIMESTAMPTZ, RLS, window functions, CTEs.
- **Use for:** Criticism
- **Aspects:** Data-critic adds this for PostgreSQL-specific numerical traps (TIMESTAMPTZ vs TIMESTAMP, NUMERIC precision, aggregate functions).
- **MCP/API:** None
- **Cost:** Free

### power-bi-model-design-review
- **Source:** [github/awesome-copilot](https://github.com/github/awesome-copilot)
- **What it does:** Data model design review: star schema compliance, relationship quality, storage modes, DAX optimization, RLS, documentation.
- **Use for:** Criticism
- **Aspects:** Data-critic adds this when reviewing BI/reporting data models — relationship cardinality, DAX calculation correctness, data quality dimensions.
- **MCP/API:** None
- **Cost:** Free

### sympy
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Symbolic mathematics — exact computation with algebra, calculus, equation solving, matrices, code generation (lambdify to NumPy).
- **Use for:** Criticism
- **Aspects:** Data-critic uses this to verify complex formulas symbolically: derive the expected formula, compare against implementation. Useful for verifying financial formulas, physics calculations, or any derived quantity.
- **MCP/API:** None
- **Cost:** Free

### pymc (Bayesian modeling)
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Bayesian modeling with PyMC — hierarchical models, MCMC, variational inference, LOO/WAIC comparison, posterior checks.
- **Use for:** Both
- **Aspects:** Data-critic uses convergence diagnostics (R-hat, ESS, divergences) and posterior predictive checks. Data-planner uses it for model specification and prior selection.
- **MCP/API:** None
- **Cost:** Free

### matplotlib / seaborn
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Visualization — matplotlib for full control, seaborn for statistical plots with automatic aggregation and confidence intervals.
- **Use for:** Both
- **Aspects:** Data-critic uses visualization to verify: "does the chart accurately represent the underlying data?" Data-planner uses it to design reporting outputs.
- **MCP/API:** None
- **Cost:** Free

### scikit-learn
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** ML pipelines — classification, regression, clustering, preprocessing, cross-validation, hyperparameter tuning.
- **Use for:** Both
- **Aspects:** Data-critic verifies pipeline correctness (data leakage prevention, correct cross-validation, appropriate metrics). Data-planner designs ML workflows.
- **MCP/API:** None
- **Cost:** Free

### fred-economic-data
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Query FRED API for 800,000+ economic time series (GDP, unemployment, inflation, interest rates) from 100+ sources.
- **Use for:** Planning
- **Aspects:** Data-planner uses this as a data source for economic analysis. Data-critic can verify that the correct FRED series was used for a given metric.
- **MCP/API:** **FRED API key required** (free from stlouisfed.org)
- **Cost:** Free tier (basic access); premium available

### alpha-vantage
- **Source:** [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
- **What it does:** Financial data — stock prices, fundamentals, options, forex, crypto, commodities, 50+ technical indicators.
- **Use for:** Planning
- **Aspects:** Data-planner uses this for financial analysis data sourcing. Limited use for criticism (verifying that the right ticker/indicator was queried).
- **MCP/API:** **Alpha Vantage API key required** (free from alphavantage.co)
- **Cost:** Free tier (25 requests/day); premium available

### financial-analyst
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Financial ratio analysis, DCF valuation, budget variance analysis, rolling forecasts, driver-based modeling with scenario analysis.
- **Use for:** Both
- **Aspects:** Data-critic uses this to verify financial calculations (correct ratio formulas, WACC calculation, sensitivity analysis methodology). Data-planner uses it for financial model design.
- **MCP/API:** None
- **Cost:** Free

### performance-profiler
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Systematic profiling — CPU flamegraphs, memory leak detection, database query optimization (EXPLAIN ANALYZE, N+1 detection), load testing.
- **Use for:** Criticism
- **Aspects:** Data-critic uses database query profiling to verify that aggregation queries are efficient and correct (EXPLAIN ANALYZE reveals actual vs estimated row counts, join strategies).
- **MCP/API:** k6 for load testing (free, open-source)
- **Cost:** Free

### pr-review-expert
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Structured PR review with blast radius analysis, security scanning, breaking change detection, test coverage delta, 30+ item checklist.
- **Use for:** Criticism
- **Aspects:** Complements data-critic with general PR quality checks. Data-critic handles numerical correctness; pr-review-expert handles security, blast radius, and coverage.
- **MCP/API:** GitHub/GitLab CLI (free)
- **Cost:** Free

### dependency-auditor
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Vulnerability scanning, license compliance, outdated detection, supply chain security across 8+ languages.
- **Use for:** Criticism
- **Aspects:** Data-critic adds this when reviewing projects that depend on numerical libraries — ensures scipy/numpy/pandas versions don't have known calculation bugs.
- **MCP/API:** Optional Snyk/Dependabot integration
- **Cost:** Free (core); Snyk paid for advanced features

### system-audit
- **Source:** [flonat/claude-research](https://github.com/flonat/claude-research)
- **What it does:** System-wide parallel health check across 6 dimensions: inventory, bibliography, conventions, documentation, ecosystem, skill quality. Dashboard output.
- **Use for:** Criticism
- **Aspects:** Meta-level audit of a research project's infrastructure. Useful for data-planner to assess project health before planning new work.
- **MCP/API:** Task tool (6 parallel sub-agents)
- **Cost:** Free

### campaign-analytics
- **Source:** [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **What it does:** Multi-touch attribution modeling, funnel conversion analysis, ROI calculation with 5 attribution models.
- **Use for:** Planning
- **Aspects:** Data-planner uses this for marketing analytics pipeline design. Data-critic uses attribution model knowledge to verify correct implementation.
- **MCP/API:** None
- **Cost:** Free

### Trail of Bits Security Skills
- **Source:** [trailofbits/skills](https://github.com/trailofbits/skills)
- **What it does:** Security-focused static analysis, variant analysis, code auditing patterns.
- **Use for:** Criticism
- **Aspects:** Useful when data pipelines have security implications (PII handling, access control on data exports). Not directly math/data focused but relevant for data governance.
- **MCP/API:** None
- **Cost:** Free

---

## Skills Excluded from Inventory

These were evaluated but not included because they aren't relevant to data/math work:

- **using-git-worktrees** (obra/superpowers) — git workflow, no data relevance
- **finishing-a-development-branch** (obra/superpowers) — merge workflow
- **using-superpowers** (obra/superpowers) — meta-skill discovery
- **writing-skills** (obra/superpowers) — skill authoring
- **senior-qa** (alirezarezvani) — React/Jest focused, not data
- **qms-audit-expert** (alirezarezvani) — ISO 13485 medical device, too domain-specific
- **skill-tester** (alirezarezvani) — meta-skill for testing other skills
- **Azure/Microsoft skills** (microsoft/github-copilot-for-azure) — cloud infrastructure, not data logic
- **Marketing skills** (coreyhaines31) — content/SEO, not data
- **Design/frontend skills** (vercel-labs, anthropics) — UI, not data

---

## Quick Reference: Skill → Use Matrix

| Skill | Critic | Planner | Requires API? | Cost |
|-------|:------:|:-------:|:-------------:|:----:|
| verification-before-completion | **✓** | ✓ | No | Free |
| systematic-debugging | **✓** | — | No | Free |
| test-driven-development | **✓** | **✓** | No | Free |
| statistical-analysis | **✓** | **✓** | No | Free |
| statsmodels | **✓** | **✓** | No | Free |
| exploratory-data-analysis | **✓** | **✓** | No | Free |
| csv-data-summarizer | ✓ | **✓** | No | Free |
| devils-advocate | **✓** | — | No | Free |
| multi-perspective | **✓** | ✓ | No | Free |
| writing-plans | — | **✓** | No | Free |
| executing-plans | — | **✓** | No | Free |
| brainstorming | — | **✓** | No | Free |
| subagent-driven-development | ✓ | **✓** | No | Free |
| dispatching-parallel-agents | ✓ | **✓** | No | Free |
| requesting/receiving-code-review | **✓** | — | No | Free |
| code-archaeology | ✓ | **✓** | No | Free |
| pipeline-manifest | — | **✓** | No | Free |
| code-review (research) | **✓** | — | No | Free |
| senior-data-engineer | — | **✓** | No | Free |
| senior-data-scientist | ✓ | **✓** | No | Free |
| bigquery-pipeline-audit | **✓** | — | No | Free |
| sql-code-review | **✓** | — | No | Free |
| postgresql-code-review | **✓** | — | No | Free |
| power-bi-model-design-review | **✓** | — | No | Free |
| sympy | **✓** | ✓ | No | Free |
| pymc | ✓ | **✓** | No | Free |
| matplotlib / seaborn | ✓ | ✓ | No | Free |
| scikit-learn | ✓ | **✓** | No | Free |
| fred-economic-data | — | **✓** | **FRED API key** | Free tier |
| alpha-vantage | — | ✓ | **AV API key** | Free (25 req/day) |
| financial-analyst | **✓** | **✓** | No | Free |
| performance-profiler | **✓** | — | k6 (free) | Free |
| pr-review-expert | ✓ | — | GitHub CLI (free) | Free |
| dependency-auditor | ✓ | — | Optional Snyk | Free core |
| system-audit | ✓ | ✓ | No | Free |
| campaign-analytics | ✓ | **✓** | No | Free |
| trailofbits security | ✓ | — | No | Free |

**Bold ✓** = primary use. Regular ✓ = secondary use.

---

## Recommended Compositions

### Data-Critic Review Workflow
1. **code-archaeology** → understand existing calculation logic
2. **data-critic** (core) → 11-phase numerical correctness review
3. **statistical-analysis** + **statsmodels** → verify statistical methods
4. **sympy** → symbolically verify complex formulas
5. **verification-before-completion** → enforce evidence for claims
6. **devils-advocate** → stress-test methodology
7. **sql-code-review** / **bigquery-pipeline-audit** → database-specific checks (when applicable)

### Data-Planner Workflow
1. **brainstorming** → explore approaches
2. **csv-data-summarizer** / **exploratory-data-analysis** → understand the data
3. **senior-data-engineer** / **senior-data-scientist** → architecture patterns
4. **writing-plans** → detailed implementation plan
5. **pipeline-manifest** → document the pipeline
6. **test-driven-development** → plan tests before implementation
7. **executing-plans** + **subagent-driven-development** → execute with checkpoints
8. **data-critic** → review at each checkpoint

---

## Sources

- [skills.sh](https://skills.sh) — Agent skills directory
- [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) — 170 scientific and research skills
- [obra/superpowers](https://github.com/obra/superpowers) — Development workflow skills
- [flonat/claude-research](https://github.com/flonat/claude-research) — Research project management skills
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — 169 production-ready engineering/business skills
- [github/awesome-copilot](https://github.com/github/awesome-copilot) — GitHub Copilot skills (compatible with Claude Code)
- [coffeefuelbump/csv-data-summarizer-claude-skill](https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill) — CSV analysis skill
- [trailofbits/skills](https://github.com/trailofbits/skills) — Security analysis skills
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — Curated skills directory
- [Best Claude Code Skills in 2026](https://www.openaitoolshub.org/en/blog/best-claude-code-skills-2026) — Skills ranking
