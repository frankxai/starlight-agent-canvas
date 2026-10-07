import type { WebsitePlan } from './website.js';

// Authored example based on the accepted Canvas repository contract. No model
// invocation, site capture, customer approval or media generation is implied.
export function websiteDirectionDemo(): WebsitePlan {
  return {
    version: 'starlight.websitePlan.v1', id: 'canvas-website-study', title: 'A place to turn context into finished work', origin: 'authored_example',
    snapshot: {
      id: 'canvas-source-contract',
      source: { kind: 'repository', repository: 'https://github.com/frankxai/starlight-agent-canvas', branch: 'main', commit: '77df15d3b1ea76dfb6540f1a52bbcbb1c77458bc' },
      observedAt: '2026-10-07T02:50:49.000Z', method: 'repository_reference',
      notes: 'AGENTS.md defines a usable canvas first, local files, optional model keys and safe MCP exports. The current workspace maps sources, supports editing and hands selected context to coding agents. These three authored alternatives explore how a dedicated product-information route could explain that work without replacing the workspace.',
      views: [
        { viewport: 'desktop', width: 1440, height: 900, status: 'reference_only', notes: 'Repository observation only. Attach an actual desktop capture before implementing a visual redesign.' },
        { viewport: 'mobile', width: 390, height: 844, status: 'reference_only', notes: 'Repository observation only. Attach an actual mobile capture; no image was generated or imported.' },
      ],
    },
    brief: {
      audience: 'Founders and creators who move evidence between their browser, notes and coding agents.',
      job: 'Explain one useful journey: bring sources together, edit a direction, preserve a reviewed state and carry scoped context into Codex or Claude.',
      outcome: 'A visitor understands the artifact they will make and can open the existing local workspace.',
      copyConstraints: 'Use concrete inputs and outputs. Separate keyless arrangement from optional model generation. Avoid revenue promises and invented customer proof.',
      accessibilityConstraints: 'Keyboard and touch access, readable long copy, visible focus, descriptive links, reduced motion and source alternatives for images.',
      productConstraints: 'Keep the first screen as the canvas. Use a separate /about route for this proposed page. Local-first v0.1; no auth, payments, hosted sync or external mutation.',
    },
    target: { status: 'resolved', repository: 'https://github.com/frankxai/starlight-agent-canvas', issueUrl: 'https://github.com/frankxai/starlight-agent-canvas/issues/27' },
    options: [
      { id: 'workshop', title: 'The open workshop', premise: 'Lead with an editable artifact and the source material beside it. A visitor sees what they can make before learning how the system works.', headline: 'Bring your context. Make something worth keeping.', body: 'Turn research, screenshots and rough notes into a direction you can edit, compare and hand to your coding agent. Your sources stay connected to the work.', action: 'Open the canvas', tradeoff: 'The artifact demonstration needs strong real evidence; a generic placeholder would weaken the promise.' },
      { id: 'constellation', title: 'The connected studio', premise: 'Show a deliberate path from evidence to a reviewed decision. Connections explain where the work came from and what can happen next.', headline: 'Give your ideas a place to become real.', body: 'Keep the product brief, useful sources and agent output in one visible workspace. Follow the connections, choose a direction and leave a precise handoff for the next step.', action: 'Start with your sources', tradeoff: 'Connections need a readable list alternative; the graph should never be the only way to understand the work.' },
      { id: 'field-notes', title: 'The founder’s field notes', premise: 'Use an editorial narrative around a single founder journey, with evidence and revision history appearing at each turning point.', headline: 'From a scattered idea to a clear next move.', body: 'Collect what you know. Shape what matters. Keep the decision you made and the evidence behind it. Carry that context into Codex or Claude when you are ready to build.', action: 'Plan your next build', tradeoff: 'A quieter story may hide the depth of the tooling; demonstrate one real export and recovery path.' },
    ],
    sections: [
      { id: 'hero', label: 'A useful first promise', kind: 'page_section', route: '/about', action: 'Open the existing canvas workspace.', why: 'Let the visitor recognize their own scattered source problem and see the editable output.', copy: 'Bring your context. Make something worth keeping. Research, notes and media become a direction you can inspect, edit and share with your coding agent.', responsive: 'Stack promise, action and source/artifact example on mobile. Keep the primary action visible without a carousel.', files: ['apps/web/app/about/page.tsx'], acceptance: ['Root / continues to show the usable workspace.', 'The primary CTA links to / and opens no external application automatically.'], accessibility: ['Use one page heading and descriptive action text.', 'Provide the same example in text when media is unavailable.'] },
      { id: 'proof', label: 'Follow one real piece of work', kind: 'funnel_step', route: '/about', action: 'Inspect how the sources became an editable brief.', why: 'Ground the promise in an artifact and a recoverable decision.', copy: 'Sources → editable direction → checkpoint → scoped implementation brief. Show the original source next to the revised paragraph and the named checkpoint.', responsive: 'Use a vertical sequence on mobile and a three-column source/direction/handoff arrangement on desktop.', files: ['apps/web/app/about/page.tsx'], acceptance: ['Example cites its source revision and labels authored content.', 'Show an actual export and reload result before claiming workflow success.'], accessibility: ['Sequence order remains readable without spatial layout.', 'Use captions and alt text for any later screenshots.'] },
      { id: 'handoff', label: 'Carry the decision into the build', kind: 'cta', route: '/about', action: 'Export selected context for a coding agent.', why: 'Show the bridge into tools the founder already uses.', copy: 'Choose the context. Keep its sources. Export a brief for Codex or Claude, then review the result against the decision you saved.', responsive: 'Keep download and copy actions separate, with a visible failure/retry message.', files: ['apps/web/app/about/page.tsx'], acceptance: ['Export is read-only and does not deploy, publish or run an agent.', 'All unresolved evidence remains visible in the packet.'], accessibility: ['Download links describe their file format.', 'Announce copy status and preserve keyboard focus.'] },
    ],
    assets: [],
  };
}
