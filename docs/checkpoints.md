# Local checkpoints and comparison

Open **History and comparison** in the workspace inspector. Name and save a checkpoint before revising a direction or asking an agent to contribute. Choose a checkpoint, then compare it with the current canvas or another checkpoint. Open individual changes to inspect the actual records. Opening a checkpoint is read-only.

Checkpoints include nodes, edges, sources, action runs and intake traces. Record timestamps are preserved. A SHA-256 content hash identifies the validated snapshot, independently of object key ordering. A hash detects accidental changes; it is not a signature or proof of who approved the work. A position-only change is distinguished from a content change.

Snapshots live at `AGENT_CANVAS_HOME/checkpoints/<canvasId>/<checkpointId>.json`, outside Git. Existing v0.1 canvases need no migration. Checkpoints are explicit, work offline, and use the current canvas lock and atomic write pattern. They do not replace the current graph or introduce a second work queue.

History is retained until the local owner removes it. There is no automatic pruning, deletion, restore, or hosted sync. Each checkpoint stores a complete snapshot, including any embedded private media; frequent checkpoints can consume disk space. Ordinary JSON, Markdown and agent-context exports continue to include only the requested current state. History is never silently attached to a handoff.

The web interface and MCP clients read the same store. MCP exposes `create_canvas_checkpoint`, `list_canvas_checkpoints`, `get_canvas_checkpoint`, and `compare_canvas_checkpoints`. Supply an explicit canvas ID; comparison defaults to the current canvas when `afterId` is omitted. These tools neither mutate another repository nor publish a site.

Missing, corrupt or mismatched history produces a visible error and never overwrites the current canvas. If a save times out, refresh history before retrying: the local operation may already have completed. Comparison reads are serialized with canvas writes so the reported input hash matches the graph inspected.

Design review:

| Before | After | Why |
| --- | --- | --- |
| Only the latest graph could be inspected. | Named local snapshots preserve exact records and hashes. | A founder can cite the state behind a direction. |
| Agent changes had to be inferred by eye. | Stable-ID comparisons expose additions, removals and changed fields. | Content edits can be distinguished from layout moves. |
| Review required graph navigation. | Keyboard and touch controls offer a list and record inspector. | Reviewing history requires no dragging. |

This feature is the review foundation for the website-direction and media-placement workflow tracked in issue #27. It does not by itself complete that workflow or the broader Starlight interface program.
