# CYRUS visual system and image references

Last updated: 8 November 2026

This note records the visual direction and externally hosted image sources used by the React workspace. The implementation is original CYRUS UI code; references inform information hierarchy and interaction patterns rather than supplying copied components or branding.

## Visual direction

- **Base:** midnight navy surfaces with a low-contrast global grid and restrained Earth-at-night backdrop.
- **Accents:** electric cyan for active/runtime focus, periwinkle blue for technical information, violet for secondary emphasis, and mint for successful states.
- **Surface treatment:** layered glass-like panels, quiet borders, soft gradients and limited glow. The task composer and run details remain the primary work surfaces.
- **Motion:** short hover transitions and a slow photographic hero drift. All animation is disabled for users who request reduced motion.
- **Responsive behavior:** the hero becomes a single column, task briefs stack, metric/fleet cards collapse, and the pipeline becomes horizontally scrollable on narrow viewports.
- **Truthfulness:** all status text continues to come from API state. Image artwork and decorative activity never imply a live worker, provider, deployment or successful run.

## Image references

The app requests images from Unsplash's image CDN. No copies are stored in this repository.

| Use | Image | Source |
|---|---|---|
| Overview hero | illuminated data-center racks | https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85 |
| Task brief: build | computer hardware / circuit board | https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=720&q=80 |
| Task brief: investigate | code on a display | https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=720&q=80 |
| Task brief: review | analytics dashboard | https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=720&q=80 |
| Workspace backdrop | Earth at night | https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=2000&q=70 |

Images are decorative context; important UI meaning is also expressed in text, labels, and status indicators. The hero includes descriptive alternative text. Task-card images are decorative (empty alt text) because each card already has a clear text label. The task images are lazy-loaded and each has a solid gradient fallback beneath it.

## License and maintenance

Unsplash's published license: https://unsplash.com/license

The Unsplash license permits broad use of downloaded images, including commercial and non-commercial use; attribution is appreciated but not required. CYRUS links to the license from the hero image. If a source URL is removed, replace it with a verified source and update this record. Do not hotlink a third-party image that has an unclear license or copy a reference product's logo, screenshot or proprietary UI assets.

## Interaction references

The existing frontend research notes remain the source for deeper product/interaction references:

- [Frontend reference research](./ui-reference-research.md)
- [Frontend reference audit](./FRONTEND_REFERENCE_AUDIT.md)

Projects studied include [OpenHands](https://github.com/OpenHands/OpenHands), [Dify](https://github.com/langgenius/dify), [Flowise](https://github.com/FlowiseAI/Flowise), [Langflow](https://github.com/langflow-ai/langflow), [Langfuse](https://github.com/langfuse/langfuse), [n8n](https://github.com/n8n-io/n8n) and [Temporal UI](https://github.com/temporalio/ui). These are used as interaction references only.


## Page navigation and operational page headers

The workspace sidebar now uses ordinary anchor destinations for Overview, Agent fleet, Runs & tasks, Code review, Deployments, Integrations, and Settings. The destinations are shareable hash routes (for example, `#/agents` and `#/review`) so the same static build works on Vercel and GitHub Pages without requiring a server-side rewrite. Browser back/forward navigation stays synchronized with the active page, and the top-bar New task link opens the run composer directly.

Operational pages use a consistent icon-led masthead with low-contrast photographic context. The mastheads reuse the five Unsplash sources already listed above; no unlicensed assets or copied product screenshots were added. Header photos are decorative, use empty alternative text, lazy loading, and a gradient fallback. Readiness, run state, approvals, and deployment claims continue to come from the API rather than the imagery.
