import os from 'node:os';
import path from 'node:path';

export function getAgentCanvasHome(): string {
  return process.env.AGENT_CANVAS_HOME?.trim() || path.join(os.homedir(), '.starlight', 'agent-canvas');
}
