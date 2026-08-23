import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCanvasRecord, listTemplates } from '../templates.js';
import {
  assertQTownInvariants,
  buildQTownWorld,
  qTownCensus,
  renderQTownSvg,
  validateQTownRegistry,
  type QTownRegistry,
} from '../q-town.js';

const registryPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/q-town/domain-agents.v1.json');

function loadRegistry(): QTownRegistry {
  return validateQTownRegistry(JSON.parse(readFileSync(registryPath, 'utf8')));
}

describe('Q-Town second-brain world', () => {
  it('lists the Q-Town template with bless-aware steps', () => {
    const template = listTemplates().find((item) => item.id === 'q_town_second_brain');
    expect(template?.steps).toContain('Keep the private vault sealed');
    expect(template?.steps).toContain('Witness, do not bless mid-flight');
  });

  it('creates a compact Q-Town canvas that never mounts private/ to MCP', () => {
    const canvas = createCanvasRecord({ title: 'Q-Town compact', template: 'q_town_second_brain' });
    const privateNode = canvas.nodes.find((node) => node.metadata.district === 'private');
    expect(privateNode?.kind).toBe('note');
    expect(privateNode?.metadata.airGapped).toBe(true);
    expect(canvas.nodes.filter((node) => node.kind === 'agent_run').length).toBeGreaterThanOrEqual(2);
    expect(canvas.nodes.some((node) => node.kind === 'mcp_tool' && node.metadata.district === 'private')).toBe(false);
    assertQTownInvariants(canvas);
  });

  it('registers one steward per estate lane and repo without live spawn', () => {
    const registry = loadRegistry();
    const world = buildQTownWorld(registry, { createdAt: '2026-08-23T13:11:00.000Z' });
    const census = qTownCensus(world);
    const repoCount = registry.lanes.reduce((sum, lane) => sum + lane.repos.length, 0);

    expect(census.domainStewards).toBe(registry.lanes.length);
    expect(census.repoAgents).toBe(repoCount);
    expect(census.airGapped).toBeGreaterThanOrEqual(1);
    expect(world.nodes.every((node) => node.metadata.status !== 'running')).toBe(true);
    expect(registry.privacy.liveProcessSpawn).toBe(false);
    expect(renderQTownSvg(world)).toContain('Q-Town Plaza');
  });

  it('can limit the world to priority-control repos', () => {
    const registry = loadRegistry();
    const world = buildQTownWorld(registry, { priorityReposOnly: true, createdAt: '2026-08-23T13:11:00.000Z' });
    expect(qTownCensus(world).repoAgents).toBe(registry.priorityControlRepos.length);
  });
});
