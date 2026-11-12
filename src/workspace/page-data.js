export const TASK_TEMPLATES = Object.freeze([
  {
    "id": "feature",
    "title": "Build a feature",
    "category": "Product engineering",
    "detail": "Turn a feature request into a scoped, testable implementation proposal.",
    "goal": "Design and implement a secure feature for an existing full-stack application. Start with acceptance criteria, inspect assumptions and dependencies, propose the API and data model, produce implementation artifacts and regression tests, review security and edge cases, and finish with a release checklist. Do not execute generated code or deploy it."
  },
  {
    "id": "incident",
    "title": "Investigate a production issue",
    "category": "Reliability",
    "detail": "Trace symptoms, rank root-cause hypotheses and propose a safe recovery.",
    "goal": "Investigate this production issue. Separate observed symptoms from assumptions, rank likely root causes, identify evidence needed, propose a minimal reversible fix, add regression coverage, and produce a monitoring and rollback plan. Do not claim that logs, tests, or systems were inspected unless evidence is provided."
  },
  {
    "id": "api",
    "title": "Design an API contract",
    "category": "Backend",
    "detail": "Create request, response, validation and error contracts before implementation.",
    "goal": "Design a versioned REST API for the requested capability. Define resource paths, request and response schemas, validation rules, authentication, authorization, pagination, idempotency, error responses, persistence behavior, observability, and contract tests. Call out compatibility and migration risks."
  },
  {
    "id": "security",
    "title": "Run a security review",
    "category": "Security",
    "detail": "Review trust boundaries, access control, secrets and unsafe execution paths.",
    "goal": "Perform a security review of the supplied application context. Map trust boundaries, authentication and authorization, input validation, secret handling, data exposure, dependency risk, generated-code execution, repository permissions, and deployment controls. Prioritize concrete findings by severity and provide remediations and regression tests."
  },
  {
    "id": "data",
    "title": "Plan a data migration",
    "category": "Data engineering",
    "detail": "Plan schema changes, backfills, compatibility and rollback.",
    "goal": "Plan a low-risk database migration for the requested change. Describe the current and target schema, migration ordering, backfill strategy, locking and availability risks, compatibility window, integrity checks, rollback or roll-forward plan, and integration tests. Do not assume the migration has run."
  },
  {
    "id": "release",
    "title": "Prepare a release review",
    "category": "Release engineering",
    "detail": "Assess tests, operational readiness, rollout and recovery before shipping.",
    "goal": "Perform a release-readiness assessment. Review architecture, API contracts, authentication, storage durability, worker capacity, CI evidence, observability, operational runbooks, rollout strategy and rollback. Distinguish verified evidence from missing evidence. Recommend go or no-go and do not deploy."
  }
]);
export const WORKSPACE_PAGE_CONTENT = Object.freeze({
  "launchpad": {
    "eyebrow": "WORKSPACE / TASK DESIGN",
    "title": "Launchpad",
    "description": "Start with an engineering outcome, choose a structured brief, and send it to the existing seven-stage workflow. Nothing starts until server-side readiness checks pass.",
    "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Start with a useful brief",
        "description": "Templates only prefill the existing task composer. Review and edit the scope before creating a real run.",
        "cards": [
          {
            "title": "Prompt library",
            "description": "Six engineering briefs for product, reliability, APIs, security, data and releases.",
            "href": "prompt-library"
          },
          {
            "title": "Runtime readiness",
            "description": "Check provider, database, access and worker prerequisites.",
            "href": "settings-runtime"
          }
        ]
      },
      {
        "title": "Understand the workflow",
        "description": "The seven-stage pipeline stores inspectable artifacts and pauses at the human review gate.",
        "cards": [
          {
            "title": "Agent fleet",
            "description": "Explore the seven fixed specialists.",
            "href": "agents"
          },
          {
            "title": "Runs & tasks",
            "description": "Open saved workflows, filtering and pagination.",
            "href": "runs"
          },
          {
            "title": "Safety policies",
            "description": "Review execution, repository and release boundaries.",
            "href": "governance-policies"
          }
        ]
      }
    ]
  },
  "runs-active": {
    "eyebrow": "EXECUTION / LIVE QUEUE",
    "title": "Active runs",
    "description": "Inspect queued and running workflows from the latest records loaded from the API. Queue totals come from the runtime snapshot when available.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Separate role registration from capacity",
        "description": "A registered agent is not an active worker. Persisted run state and worker heartbeats remain the source of truth.",
        "cards": [
          {
            "title": "Queue monitor",
            "description": "Inspect queued, running and orphaned counts plus worker readiness.",
            "href": "observability-queue"
          },
          {
            "title": "Agent fleet",
            "description": "View role registration separately from runtime capacity.",
            "href": "agents"
          }
        ]
      }
    ]
  },
  "runs-history": {
    "eyebrow": "EXECUTION / RETAINED RECORDS",
    "title": "Run history",
    "description": "Review completed, failed, cancelled and approved workflow records. This page shows the records currently loaded from the API; the main run list provides pagination and search.",
    "image": "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Continue an investigation",
        "description": "Each workflow opens saved stages, artifacts, errors and retained event history.",
        "cards": [
          {
            "title": "Activity stream",
            "description": "Review the latest loaded workflow state changes.",
            "href": "observability-activity"
          },
          {
            "title": "Review history",
            "description": "Find runs with a recorded approval outcome.",
            "href": "review-history"
          },
          {
            "title": "Search and export",
            "description": "Open the main run list for search, filters, pagination and CSV.",
            "href": "runs"
          }
        ]
      }
    ]
  },
  "prompt-library": {
    "eyebrow": "EXECUTION / REUSABLE BRIEFS",
    "title": "Prompt library",
    "description": "Reusable task briefs are starting points, not hidden automation. Selecting one prefills the composer so its scope can be reviewed and edited before submission.",
    "image": "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Write a better request",
        "description": "Specific outcomes, constraints and acceptance criteria produce more useful agent artifacts.",
        "cards": [
          {
            "title": "Runs & tasks",
            "description": "Open the task composer and saved workflow history.",
            "href": "runs"
          },
          {
            "title": "Launchpad",
            "description": "Return to the task-first starting point.",
            "href": "launchpad"
          }
        ]
      }
    ]
  },
  "review-history": {
    "eyebrow": "QUALITY / DECISION RECORDS",
    "title": "Review history",
    "description": "See approved and rejected workflow decisions. Reviewer notes and complete artifacts remain attached to each saved run and can be inspected in its detail drawer.",
    "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Keep review separate from release",
        "description": "Approval records a human decision only. It is not a deployment instruction and does not execute generated code.",
        "cards": [
          {
            "title": "Pending reviews",
            "description": "Open the actionable queue of workflows awaiting a decision.",
            "href": "review"
          },
          {
            "title": "Safety policies",
            "description": "Inspect the human approval and execution boundaries.",
            "href": "governance-policies"
          }
        ]
      }
    ]
  },
  "deploy-workspace": {
    "eyebrow": "DELIVERY / FRONTEND TARGET",
    "title": "Workspace application",
    "description": "The configured Vercel workspace URL is a destination, not proof of a successful latest deployment. Confirm the exact commit and production state in Vercel.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Frontend destination",
        "description": "Verify domains, build output and the published commit in the provider.",
        "cards": [
          {
            "title": "Production workspace",
            "description": "Open the configured React workspace URL.",
            "external": "https://cyrus-workspace-mahendra8.vercel.app"
          },
          {
            "title": "Vercel project",
            "description": "Inspect production deployments and build logs.",
            "external": "https://vercel.com/mahendra8/cyrus-workspace"
          }
        ]
      },
      {
        "title": "Pre-release checks",
        "description": "A frontend deploy is not enough if its API target or runtime settings are unavailable.",
        "cards": [
          {
            "title": "API service",
            "description": "Inspect the backend service and health documentation.",
            "href": "deploy-api"
          },
          {
            "title": "CI pipeline",
            "description": "Review automated tests and container checks.",
            "href": "ci-pipeline"
          }
        ]
      }
    ]
  },
  "deploy-api": {
    "eyebrow": "DELIVERY / BACKEND TARGET",
    "title": "CYRUS API service",
    "description": "Inspect the FastAPI service, health documentation and runtime gates that control whether real workflows can start.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Service resources",
        "description": "Use API docs and the Vercel project to inspect the service. Never put credentials in browser-visible configuration.",
        "cards": [
          {
            "title": "FastAPI documentation",
            "description": "Open the configured API documentation endpoint.",
            "external": "https://cyrus-api-mahendra8.vercel.app/docs"
          },
          {
            "title": "API project",
            "description": "Inspect builds, settings and runtime logs.",
            "external": "https://vercel.com/mahendra8/cyrus-api"
          }
        ]
      },
      {
        "title": "Runtime dependencies",
        "description": "Production readiness depends on provider, durable database, access control and a supervised worker.",
        "cards": [
          {
            "title": "Runtime health",
            "description": "Review the live dependency snapshot.",
            "href": "settings-runtime"
          },
          {
            "title": "Database",
            "description": "Inspect reachability and durable storage requirements.",
            "href": "integration-database"
          }
        ]
      }
    ]
  },
  "ci-pipeline": {
    "eyebrow": "DELIVERY / AUTOMATED CHECKS",
    "title": "CI pipeline",
    "description": "Review the repository's automated checks. A passing CI run validates the tested commit; it does not prove external runtime credentials or a live worker are configured.",
    "image": "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Checks defined in the repository",
        "description": "The current workflow validates frontend tests and build, backend tests, Compose hardening and a non-root API container smoke test.",
        "cards": [
          {
            "title": "GitHub Actions",
            "description": "Open workflow run history.",
            "external": "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions"
          },
          {
            "title": "CI workflow source",
            "description": "Read the pipeline definition on main.",
            "external": "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/blob/main/.github/workflows/ci.yml"
          }
        ]
      },
      {
        "title": "Promote deliberately",
        "description": "Human approval is a recorded review decision; deployment is a separate operator action.",
        "cards": [
          {
            "title": "Review history",
            "description": "Inspect recorded human decisions.",
            "href": "review-history"
          },
          {
            "title": "Deployment targets",
            "description": "Verify frontend and API separately.",
            "href": "deployments"
          }
        ]
      }
    ]
  },
  "integration-models": {
    "eyebrow": "INTEGRATIONS / MODEL RUNTIME",
    "title": "AI provider",
    "description": "CYRUS supports the OpenAI Responses API pattern with an OpenAI-compatible HTTPS base URL option. Provider credentials remain server-side.",
    "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Configure the model service",
        "description": "The API exposes provider readiness and a model name; the browser never receives the API key.",
        "cards": [
          {
            "title": "OpenAI Responses API",
            "description": "Read the official API reference.",
            "external": "https://platform.openai.com/docs/api-reference/responses"
          },
          {
            "title": "Runtime configuration",
            "description": "Inspect whether the API reports a provider configured.",
            "href": "settings-runtime"
          }
        ]
      },
      {
        "title": "Related controls",
        "description": "The model provider is one prerequisite among several for a real workflow.",
        "cards": [
          {
            "title": "Workspace access",
            "description": "Confirm the server access-control state.",
            "href": "settings-access"
          },
          {
            "title": "Database storage",
            "description": "Check connectivity and production durability.",
            "href": "integration-database"
          }
        ]
      }
    ]
  },
  "integration-research": {
    "eyebrow": "INTEGRATIONS / RESEARCH SOURCES",
    "title": "Web research",
    "description": "The runtime reports whether live web research is enabled for Scout. This page does not imply a browser, MCP server or external search account is connected unless the API says so.",
    "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Research capability",
        "description": "When enabled, Scout can use the configured research integration. Otherwise it must separate background knowledge from facts requiring live verification.",
        "cards": [
          {
            "title": "Scout research role",
            "description": "Review how research evidence fits into agent hand-offs.",
            "href": "agent-scout"
          },
          {
            "title": "API configuration",
            "description": "Check the runtime's live web-search flag.",
            "href": "settings-runtime"
          }
        ]
      },
      {
        "title": "Protocol reference",
        "description": "The browser EventSource API is separate from the current polling-based run detail refresh.",
        "cards": [
          {
            "title": "Server-sent events",
            "description": "Read the browser platform reference.",
            "external": "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events"
          }
        ]
      }
    ]
  },
  "integration-github": {
    "eyebrow": "INTEGRATIONS / SOURCE CONTROL",
    "title": "GitHub source",
    "description": "GitHub is a public source-code and CI link in the current product. Agent-generated code is not written back to repositories, branches or pull requests.",
    "image": "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Repository resources",
        "description": "Browse the real main branch and inspect automated checks directly on GitHub.",
        "cards": [
          {
            "title": "CYRUS repository",
            "description": "Open the public source repository.",
            "external": "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System"
          },
          {
            "title": "GitHub Actions",
            "description": "Review checks associated with a commit.",
            "external": "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions"
          }
        ]
      },
      {
        "title": "Write boundary",
        "description": "No personal access token or automatic GitHub write adapter is exposed to agent workflows.",
        "cards": [
          {
            "title": "Safety policies",
            "description": "Review no-write and human-approval rules.",
            "href": "governance-policies"
          },
          {
            "title": "Review queue",
            "description": "Inspect artifacts before external action.",
            "href": "review"
          }
        ]
      }
    ]
  },
  "integration-database": {
    "eyebrow": "INTEGRATIONS / PERSISTENCE",
    "title": "Database",
    "description": "The API distinguishes database reachability from durable production storage. SQLite supports local development; serverless production needs managed PostgreSQL or MySQL.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Storage prerequisites",
        "description": "The runtime snapshot reports dialect, reachability and whether the configured store is durable for this deployment.",
        "cards": [
          {
            "title": "Runtime health",
            "description": "Review the live database and worker checks.",
            "href": "settings-runtime"
          },
          {
            "title": "SQLAlchemy MySQL dialect",
            "description": "Read supported SQLAlchemy MySQL documentation.",
            "external": "https://docs.sqlalchemy.org/en/20/dialects/mysql.html"
          }
        ]
      },
      {
        "title": "Database documentation",
        "description": "For PostgreSQL, use the provider's direct connection guide and keep the URL server-side.",
        "cards": [
          {
            "title": "Supabase PostgreSQL",
            "description": "Read the official database connection guide.",
            "external": "https://supabase.com/docs/guides/database/connecting-to-postgres"
          }
        ]
      }
    ]
  },
  "observability": {
    "eyebrow": "OBSERVABILITY / WORKSPACE SIGNAL",
    "title": "Observability",
    "description": "A clear operational view of saved runs, workflow state and runtime snapshots. CYRUS avoids fabricated traces, latency percentiles or token costs when the API does not provide them.",
    "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Inspect real workflow signals",
        "description": "Use the retained run list and detail drawer as the source of truth.",
        "cards": [
          {
            "title": "Activity stream",
            "description": "Review the latest saved run records.",
            "href": "observability-activity"
          },
          {
            "title": "Queue monitor",
            "description": "Inspect persisted queue pressure and worker readiness.",
            "href": "observability-queue"
          },
          {
            "title": "Usage & tokens",
            "description": "Review token usage included in saved artifacts only.",
            "href": "observability-usage"
          }
        ]
      }
    ]
  },
  "observability-activity": {
    "eyebrow": "OBSERVABILITY / EVENT CONTEXT",
    "title": "Activity stream",
    "description": "Inspect the latest queued, running and terminal workflow records returned by the API. Open a run to review retained event history and stage artifacts; summaries are not presented as a full trace.",
    "image": "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80",
    "sections": [
      {
        "title": "Move from signal to evidence",
        "description": "The run drawer contains the persisted stage and event payloads currently available for that run.",
        "cards": [
          {
            "title": "Run history",
            "description": "Search, filter, paginate and export saved workflow records.",
            "href": "runs"
          },
          {
            "title": "Workflow audit",
            "description": "Inspect run-level evidence exposed by the API.",
            "href": "governance-audit"
          }
        ]
      }
    ]
  },
  "observability-queue": {
    "eyebrow": "OBSERVABILITY / CAPACITY",
    "title": "Queue monitor",
    "description": "Queue counts and worker heartbeats are shown only when returned by the runtime endpoint. A registered role does not mean a worker is currently available.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Understand the execution path",
        "description": "The API reports queued and running workflows, orphaned work awaiting recovery and recent worker heartbeats when configured.",
        "cards": [
          {
            "title": "Active runs",
            "description": "Open queued and running workflow records.",
            "href": "runs-active"
          },
          {
            "title": "Runtime health",
            "description": "Review worker and storage readiness.",
            "href": "settings-runtime"
          }
        ]
      }
    ]
  },
  "observability-usage": {
    "eyebrow": "OBSERVABILITY / MODEL USAGE",
    "title": "Usage & tokens",
    "description": "The run list returns lightweight summaries; open a saved run to load its stage usage before reviewing token counts. CYRUS does not estimate dollar cost without a configured price sheet and complete usage records.",
    "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Usage visibility",
        "description": "Open individual workflow artifacts to inspect input and output token counts when the provider returned them.",
        "cards": [
          {
            "title": "Run history",
            "description": "Open saved workflows and inspect detailed stage usage.",
            "href": "runs-history"
          },
          {
            "title": "Runtime settings",
            "description": "Check which model the backend reports as configured.",
            "href": "integration-models"
          }
        ]
      }
    ]
  },
  "governance": {
    "eyebrow": "GOVERNANCE / OPERATOR CONTROL",
    "title": "Governance",
    "description": "CYRUS is designed around explicit authority boundaries: generated artifacts are reviewable, approvals are recorded, and sensitive external actions remain outside the agent runtime.",
    "image": "https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=1600&q=75",
    "sections": [
      {
        "title": "Policies and evidence",
        "description": "Inspect non-negotiable safety boundaries and workflow history exposed by the API.",
        "cards": [
          {
            "title": "Safety policies",
            "description": "Read execution, repository and release constraints.",
            "href": "governance-policies"
          },
          {
            "title": "Workflow audit log",
            "description": "Review run statuses and retained artifacts.",
            "href": "governance-audit"
          }
        ]
      }
    ]
  },
  "governance-policies": {
    "eyebrow": "GOVERNANCE / SAFETY CONTROLS",
    "title": "Safety policies",
    "description": "These product boundaries are enforced by the current architecture and must not be replaced by decorative status badges or an unchecked release button.",
    "image": "https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=1600&q=75",
    "sections": [
      {
        "title": "Sensitive operations",
        "description": "Human review is a recorded decision. It does not grant broad credentials, execute code or deploy a release.",
        "cards": [
          {
            "title": "Review queue",
            "description": "Inspect and decide on saved workflow artifacts.",
            "href": "review"
          },
          {
            "title": "Workspace access",
            "description": "Check access-control configuration without exposing credentials.",
            "href": "settings-access"
          },
          {
            "title": "GitHub source",
            "description": "See the source-control read-only boundary.",
            "href": "integration-github"
          }
        ]
      }
    ]
  },
  "governance-audit": {
    "eyebrow": "GOVERNANCE / WORKFLOW EVIDENCE",
    "title": "Workflow audit log",
    "description": "Inspect the latest saved workflow decisions and retained event counts. Open a run to review its bounded event timeline; this is not a separate identity, credential-access or administrative audit service.",
    "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Evidence boundaries",
        "description": "Run events provide workflow context, while identity and administrative audit records are not exposed as a dedicated API resource.",
        "cards": [
          {
            "title": "Run history",
            "description": "Inspect complete workflow records and export loaded records.",
            "href": "runs"
          },
          {
            "title": "Review history",
            "description": "Inspect recorded approval outcomes.",
            "href": "review-history"
          }
        ]
      }
    ]
  },
  "settings-runtime": {
    "eyebrow": "SETTINGS / DEPENDENCY HEALTH",
    "title": "Runtime health",
    "description": "Read the live API configuration snapshot, including provider, database, access control, worker capacity and queue readiness. Values are never inferred from a successful frontend build.",
    "image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    "sections": [
      {
        "title": "Resolve blockers in order",
        "description": "A running UI is not enough to start a workflow. The backend must report every required prerequisite as ready.",
        "cards": [
          {
            "title": "AI provider",
            "description": "Inspect the server-side model configuration.",
            "href": "integration-models"
          },
          {
            "title": "Database",
            "description": "Verify connection reachability and durable storage.",
            "href": "integration-database"
          },
          {
            "title": "Deployment targets",
            "description": "Verify frontend and API separately.",
            "href": "deployments"
          }
        ]
      }
    ]
  },
  "settings-access": {
    "eyebrow": "SETTINGS / ACCESS CONTROL",
    "title": "Workspace access",
    "description": "CYRUS can require a server-side workspace access key. The browser stores the operator-provided key for the current session only and never displays the saved value.",
    "image": "https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=1600&q=75",
    "sections": [
      {
        "title": "Keep authority scoped",
        "description": "The current deployment uses a shared workspace access key rather than multi-user roles. Do not interpret this page as per-user RBAC.",
        "cards": [
          {
            "title": "Runtime configuration",
            "description": "Check whether access control is required and configured.",
            "href": "settings-runtime"
          },
          {
            "title": "Safety policies",
            "description": "Review actions that remain disabled even after login.",
            "href": "governance-policies"
          }
        ]
      }
    ]
  },
  "settings-appearance": {
    "eyebrow": "SETTINGS / VISUAL SYSTEM",
    "title": "Appearance",
    "description": "CYRUS uses a dark engineering workspace with midnight navy surfaces, electric cyan focus states, blue and violet hierarchy, and mint success cues.",
    "image": "https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=1600&q=75",
    "sections": [
      {
        "title": "Design tokens",
        "description": "The current theme is a shared product system, not per-page decoration. A saved theme switcher is not implemented, so this page documents the active palette only.",
        "cards": [
          {
            "title": "Design references",
            "description": "Review open-source interaction references and image credits.",
            "href": "governance"
          },
          {
            "title": "Workspace overview",
            "description": "Return to the primary dashboard and task composer.",
            "href": "overview"
          }
        ]
      }
    ]
  }
});
