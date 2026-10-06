import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// SIS owns session continuity. Canvas only reads the versioned status contract from
// `starlight-continuity status --json`; it never imports, admits or resumes work.
export const CONTINUITY_STATUS_SCHEMA = 'starlight.continuity-status.v1' as const;

const proofKind = z.enum(['artifact', 'change', 'checks', 'deployment', 'verification']);
const requirementsSchema = z.object({
  artifact: z.boolean(), change: z.boolean(), checks: z.boolean(), deployment: z.boolean(), verification: z.boolean(),
});

export const continuityWorkSchema = z.object({
  workId: z.string().min(1),
  projectId: z.string().min(1),
  ownerActorId: z.string().nullable(),
  state: z.enum(['submitted', 'input-required', 'working', 'blocked', 'completed']),
  intent: z.object({
    distinctRequests: z.number().int().nonnegative(),
    observations: z.number().int().nonnegative(),
    harnesses: z.array(z.string()),
    firstObservedAt: z.string().nullable(),
    lastObservedAt: z.string().nullable(),
    captureCompleteness: z.array(z.string()),
    goalAuthority: z.array(z.string()),
  }),
  reportedState: z.object({ value: z.string(), verification: z.enum(['operator-supplied', 'native-goal-store']) }).nullable(),
  // A workspace session ran outside any checkout; older SIS builds omit both fields.
  scope: z.enum(['checkout', 'workspace']).nullable().optional(),
  checkout: z.object({ origin: z.string(), branch: z.string(), head: z.string(), dirty: z.boolean() }).nullable(),
  workspace: z.object({ root: z.string() }).nullable().optional(),
  admission: z.object({ admitted: z.boolean(), byActorId: z.string().nullable(), requirements: requirementsSchema.nullable() }),
  delivery: z.object({
    proofEventIds: z.record(proofKind, z.array(z.string())),
    missingProofs: z.array(proofKind),
    readyToComplete: z.boolean(),
    completed: z.boolean(),
  }),
  quarantined: z.number().int().nonnegative(),
  mayAutomaticallyResume: z.literal(false),
});

export const continuityStatusSchema = z.object({
  schemaVersion: z.literal(CONTINUITY_STATUS_SCHEMA),
  works: z.array(continuityWorkSchema),
  unattributedQuarantine: z.number().int().nonnegative(),
  issues: z.array(z.object({ code: z.string(), eventId: z.string(), workId: z.string(), message: z.string() })),
  imports: z.number().int().nonnegative(),
});

export type ContinuityWork = z.infer<typeof continuityWorkSchema>;
export type ContinuityStatusDocument = z.infer<typeof continuityStatusSchema>;

export type ContinuityUnavailableReason = 'not-configured' | 'cli-missing' | 'policy-missing' | 'refused' | 'timeout' | 'malformed';

export type ContinuityReadResult =
  | { state: 'ready'; source: ContinuitySource; status: ContinuityStatusDocument }
  | { state: 'unavailable'; source: ContinuitySource; reason: ContinuityUnavailableReason; detail: string; recovery: string };

export interface ContinuitySource {
  system: 'sis';
  command: string;
  observedAt: string;
}

type ExecFile = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number; env: NodeJS.ProcessEnv },
  callback: (error: (Error & { code?: number | string; killed?: boolean }) | null, stdout: string, stderr: string) => void,
) => unknown;

const RECOVERY: Record<ContinuityUnavailableReason, string> = {
  'not-configured': 'Set STARLIGHT_CONTINUITY_CLI to the absolute path of SIS dist/continuity-cli.js, then refresh.',
  'cli-missing': 'Build or install Starlight Intelligence System so dist/continuity-cli.js exists at the configured path.',
  'policy-missing': 'Install a starlight.continuity-trust.v1 policy at ~/.starlight/continuity/trust-policy.json (or SIS_CONTINUITY_HOME).',
  refused: 'Run `starlight-continuity status` in a terminal to see the refusal, fix it, then refresh. Stored work is unchanged.',
  timeout: 'SIS did not answer in time. Refresh once the machine is less busy.',
  malformed: 'This Canvas build does not understand the SIS status format. Update Canvas or SIS so both use starlight.continuity-status.v1.',
};

function unavailable(source: ContinuitySource, reason: ContinuityUnavailableReason, detail: string): ContinuityReadResult {
  return { state: 'unavailable', source, reason, detail, recovery: RECOVERY[reason] };
}

export function parseContinuityStatus(stdout: string): ContinuityStatusDocument | null {
  try {
    const parsed = continuityStatusSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readContinuityStatus(options: {
  cli?: string;
  exec?: ExecFile;
  timeoutMs?: number;
  now?: () => Date;
} = {}): Promise<ContinuityReadResult> {
  const cli = options.cli ?? process.env.STARLIGHT_CONTINUITY_CLI?.trim() ?? '';
  const now = options.now ?? (() => new Date());
  const source: ContinuitySource = { system: 'sis', command: 'starlight-continuity status --json', observedAt: now().toISOString() };
  if (!cli) return Promise.resolve(unavailable(source, 'not-configured', 'STARLIGHT_CONTINUITY_CLI is not set.'));
  if (!path.isAbsolute(cli) || !fs.existsSync(cli)) return Promise.resolve(unavailable(source, 'cli-missing', 'The configured continuity CLI was not found.'));
  const exec = options.exec ?? (execFile as unknown as ExecFile);
  return new Promise((resolve) => {
    // Fixed argv through node: no shell, and no caller input reaches the command line.
    exec(process.execPath, [cli, 'status', '--json'], {
      timeout: options.timeoutMs ?? 15_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: process.env,
    }, (error, stdout, stderr) => {
      const observed = { ...source, observedAt: now().toISOString() };
      if (error) {
        if (error.killed) return resolve(unavailable(observed, 'timeout', 'The status command was stopped after its time limit.'));
        // SIS reports policy problems on stderr; paths stay local and are not echoed to the page.
        const missingPolicy = /trust-policy|ENOENT/i.test(stderr);
        return resolve(unavailable(observed, missingPolicy ? 'policy-missing' : 'refused', missingPolicy ? 'No continuity trust policy is installed.' : 'SIS refused the status request.'));
      }
      const status = parseContinuityStatus(stdout);
      resolve(status ? { state: 'ready', source: observed, status } : unavailable(observed, 'malformed', 'SIS returned a status document this version cannot validate.'));
    });
  });
}

export type ContinuityAttention = 'needs-owner' | 'in-progress' | 'blocked' | 'done' | 'awaiting-admission';

/** One plain-language next step per work item; never an instruction to resume. */
export function describeContinuityWork(work: ContinuityWork): { attention: ContinuityAttention; nextStep: string; unknowns: string[] } {
  const unknowns: string[] = [];
  if (!work.ownerActorId) unknowns.push('owner');
  if (!work.checkout && work.scope !== 'workspace') unknowns.push('checkout');
  if (!work.reportedState) unknowns.push('reported state');
  if (work.intent.captureCompleteness.length === 0 || work.intent.captureCompleteness.some((c) => c !== 'complete')) unknowns.push('capture completeness');
  switch (work.state) {
    case 'completed':
      return { attention: 'done', nextStep: 'Delivered with the required proof.', unknowns };
    case 'blocked':
      return { attention: 'blocked', nextStep: 'Blocked by an owner decision. Nothing will run until the owner records a new decision.', unknowns };
    case 'working':
      return {
        attention: 'in-progress',
        nextStep: work.delivery.missingProofs.length
          ? `Admitted. Still missing proof: ${work.delivery.missingProofs.join(', ')}.`
          : 'Admitted with all proof present; completion can be recorded.',
        unknowns,
      };
    case 'input-required':
      return {
        attention: 'needs-owner',
        nextStep: work.reportedState
          ? `Last reported ${work.reportedState.value}. The owner must check the checkout and uncommitted work, then reconcile explicitly.`
          : 'Reported state is unknown. The owner must check the checkout and uncommitted work, then reconcile explicitly.',
        unknowns,
      };
    default:
      return { attention: 'awaiting-admission', nextStep: 'Intent captured. The owner decides whether to admit it.', unknowns };
  }
}
