# Atlas context receiving pilot

The `/context` view opens one explicitly imported entity packet and keeps its source claims, conflicts and relationship IDs together. It provides an equivalent semantic list on desktop and phone. It performs no source fetch, canvas/store write, identity merge, memory promotion or agent execution.

The packet is a disposable read model of authoritative sources, not another graph or queue. This receiving-side file pilot does not complete Canvas #30's producer-side one-click Atlas handoff. Command's #39/#40 source adapter and source-safe export, real return location, physical-phone validation and a founder workflow comparison remain pending. There is no verified return-to-Atlas link; the view returns to Canvas and exposes the packet's explicit source links.

## Source contract

Coordination read Command `origin/main` at `eaa218cad7b07e1484ba4005989c6b73c3daea99`: `docs/command-atlas-20260910/model.mjs`, its implementation brief, Observatory graph model and prepared-runtime projection contract. This packet adopts stable IDs, source references, source revision, observed/verification distinction, owner-declared freshness and retained conflicting/proposed evidence. The producer contract is still pending adoption by an owned Command lane. No Command application code or canonical SIS ontology was changed.

`starlight.atlasContext.v1` has strict known fields, 64 KB UTF-8 maximum, one entity, at most five HTTPS source URLs, twelve claims and twenty relationships. IDs are source IDs; UUIDs are only local navigation references. Entity types and relation verbs are bounded. Inputs with duplicate IDs, unsupported fields, malformed timestamps, credential URLs, query/fragment parameters, known secret patterns, reserved directional/control characters or machine paths in text are rejected. URL references reject percent encoding, whitespace and drive paths; public web paths such as `/users/guide` remain valid. Plain status placeholders such as `API key: missing` are accepted. Links are syntactic references only: hostname syntax cannot establish public accessibility, repository privacy, ownership or source truth. No DNS or network fetch occurs. The `local_context` marker is a declaration, not authentication or privacy certification. Labels/private repository names cannot be reliably classified without the producer's access-aware filtering; keep all context local and do not invent a public-sharing mode.

```json
{
  "version": "starlight.atlasContext.v1",
  "privacy": "local_context",
  "source": { "system": "starlight-command-center" },
  "entity": { "id": "product:agent-canvas", "label": "Starlight Agent Canvas", "type": "product" },
  "observedAt": null,
  "evidence": "record_only",
  "sources": ["https://github.com/frankxai/starlight-agent-canvas"],
  "claims": [],
  "relationships": []
}
```

Optional `source.revision` is a full Git SHA. Optional `owner` supplies its stable `id` and explicit `ttlSeconds` (1–604800). `verifiedAt` is optional and nullable. Freshness remains unknown without observation or owner TTL, and for a future observation. Freshness says only whether the declared observation is within its owner window. All evidence, including a producer verification timestamp, remains a producer report. Divergent values for one claim property are conservatively flagged as conflicting and retained; no selected winner is created. Relationship targets remain unresolved and cannot auto-load or mutate Canvas.

## Recovery and privacy

Import requires a user file action. The schema is browser-safe and contains no server-side store. The app validates first, saves under `starlight.atlas.context.v1:<random UUID>` in `sessionStorage`, then navigates to `/context/<UUID>`. Random references use `crypto.getRandomValues`, including an explicitly enabled HTTP LAN view. Entity labels, source URLs and claims never become generated query/path parameters, request bodies or telemetry. Storage failure holds the prior visible context. Old references are retained across subsequent imports for back/interrupted navigation, up to32 records; further imports hold without pruning. A bounded inventory scans at most2000 storage keys, reports the retained count and offers explicit confirmed removal of all Atlas contexts only. Forget removes only the selected reference. UI receipts survive route transitions but never become source evidence. Partial-removal failure asks the user to inspect actual remaining storage rather than claiming erasure. Reload revalidates the stored packet; corrupt records are preserved and reported unavailable. A fresh tab with only the URL has an unavailable state. Browser duplication/opener cloning and session restore may copy or retain tab storage; no guaranteed erasure on closing a tab is claimed. Same-origin scripts/extensions/browser access can read tab storage, so this is not encrypted isolation.

Links open only after a user action in a new tab with `noopener`, `noreferrer` and no referrer, with distinct accessible names. The handoff address has no context payload. No shareable public URL export, cross-origin message listener, background polling/fetch, local-server broker, daemon, scheduler or execution adapter was added. A visibility-aware local clock updates displayed age without shifting selection or keyboard focus. Imported-context navigation places focus on the entity heading; reload/back recovery avoids programmatic focus changes. Cancel import restores focus to the file control and ignores any late read result. File reads themselves are not abortable through `File.text()`; generation/unmount guards prevent an abandoned result from replacing context.

Explicit JSON and Markdown downloads make the selected context portable to the user's native tools or intended recipient. The Markdown brief fences all imported text as data using a delimiter longer than any source delimiter and states the authority limits outside it. Downloads contain source context and require the user's privacy decision; a local storage declaration does not make their contents public. Import failures show a known schema field path without echoing rejected values or unknown-key messages. Storage failures and corrupt input have different messages.

## Alternative and acceptance

The serious alternative is the existing manual Markdown/native-app handoff. This view keeps stable IDs, bounded relationships and separately aged/conflicting claims visible, whereas a copied paragraph requires interpreting those fields manually. That architectural difference does not establish a time saving. Measure the same selected entity, find its owner/open decision, inspect conflicting evidence and recover interrupted navigation in both workflows. Record actual time, repair effort and usefulness before claiming an improvement or enabling broader integration.

Behavior cases cover valid/stale/future/missing/conflicting/oversized/unsafe inputs, opaque-reference isolation, invalid replacement, storage failure, corrupt recovery and explicit removal. Browser scenarios exercise desktop/mobile, reduced motion, keyboard focus, no source fetch, no Canvas mutation and honest unavailable links. Full-page screenshots require actual inspection and provenance before release. Structural tests and synthetic fixtures do not establish live Atlas integration, physical touch, screen-reader experience or customer acceptance.

Implementation follows the current official [Next route parameter convention](https://nextjs.org/docs/app/api-reference/file-conventions/page), [React effect lifecycle](https://react.dev/reference/react/useEffect), [Web Storage session behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) and [Zod strict object validation](https://zod.dev/api#objects). The installed package versions remain unchanged.
