import { describe, expect, it } from 'vitest';
import { CONTINUITY_STATUS_SCHEMA, FileCanvasStore, type ContinuityReadResult } from '@starlight-agent-canvas/core';
import { createToolHandlers } from '../tool-handlers.js';

const source = { system: 'sis' as const, command: 'starlight-continuity status --json', observedAt: '2026-10-04T18:00:00.000Z' };
const proofs = { artifact: [], change: [], checks: [], deployment: [], verification: [] };

describe('get_continuity_status', () => {
  it('reports recovered work with source, owner guidance and unknowns, without resume language', async () => {
    const ready: ContinuityReadResult = {
      state: 'ready', source,
      status: {
        schemaVersion: CONTINUITY_STATUS_SCHEMA, unattributedQuarantine: 0, issues: [], imports: 1,
        works: [{
          workId: 'work:continuity', projectId: 'project:sis', ownerActorId: null, state: 'input-required',
          intent: { distinctRequests: 1, observations: 1, harnesses: ['codex'], firstObservedAt: null, lastObservedAt: null, captureCompleteness: ['complete'], goalAuthority: ['explicit-user-directive'] },
          reportedState: { value: 'paused', verification: 'operator-supplied' }, checkout: null,
          admission: { admitted: false, byActorId: null, requirements: null },
          delivery: { proofEventIds: proofs, missingProofs: [], readyToComplete: false, completed: false },
          quarantined: 0, mayAutomaticallyResume: false,
        }],
      },
    };
    const handlers = createToolHandlers(new FileCanvasStore(), async () => ready);
    const result = await handlers.get_continuity_status();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('work:continuity [input-required] owner unknown');
    expect(result.content[0].text).toContain('Unknown: owner, checkout.');
    expect(result.content[0].text).toContain('observed 2026-10-04T18:00:00.000Z');
    expect(result.structuredContent?.source).toEqual(source);
  });

  it('returns an actionable error result when SIS is unavailable', async () => {
    const handlers = createToolHandlers(new FileCanvasStore(), async () => ({
      state: 'unavailable', source, reason: 'policy-missing', detail: 'No continuity trust policy is installed.', recovery: 'Install a policy.',
    }));
    const result = await handlers.get_continuity_status();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Session continuity is unavailable (policy-missing): No continuity trust policy is installed. Install a policy.');
  });
});