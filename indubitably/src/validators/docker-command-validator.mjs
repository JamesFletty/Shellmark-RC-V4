import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { invariant } from '../domain/errors.mjs';
import { canonicalJson } from '../domain/canonical-json.mjs';

function runProcess(command, args, { timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, timedOut, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

export class DockerCommandValidator {
  id = 'docker-command-v1';
  verificationType = 'deterministic';

  constructor({ workspaceRoot, maximumOutputBytes = 1_000_000 }) {
    this.workspaceRoot = workspaceRoot;
    this.maximumOutputBytes = maximumOutputBytes;
  }

  async run({ config }) {
    invariant(typeof config?.image === 'string' && config.image.includes('@sha256:'), 'INVALID_VALIDATOR_CONFIG', 'Docker validator image must be pinned by digest.');
    invariant(Array.isArray(config.command) && config.command.length > 0, 'INVALID_VALIDATOR_CONFIG', 'Docker validator command must be a non-empty string array.');
    const timeoutMs = Math.min(Number(config.timeout_ms ?? 120_000), 600_000);
    const root = await realpath(this.workspaceRoot);
    const requested = await realpath(resolve(root, config.workspace_relative_path ?? '.'));
    invariant(requested === root || requested.startsWith(`${root}${sep}`), 'INVALID_VALIDATOR_CONFIG', 'Workspace path escapes the configured validator root.');

    const args = [
      'run', '--rm',
      '--network', 'none',
      '--read-only',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', '128',
      '--memory', config.memory ?? '512m',
      '--cpus', String(config.cpus ?? 1),
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m',
      '--mount', `type=bind,src=${requested},dst=/workspace,readonly`,
      '--workdir', '/workspace',
      config.image,
      ...config.command.map(String)
    ];

    const processResult = await runProcess('docker', args, { timeoutMs });
    const stdout = processResult.stdout.slice(0, this.maximumOutputBytes);
    const stderr = processResult.stderr.slice(0, this.maximumOutputBytes);
    const accepted = processResult.code === 0 && !processResult.timedOut;
    const evidence = {
      image: config.image,
      command: config.command,
      exit_code: processResult.code,
      signal: processResult.signal,
      timed_out: processResult.timedOut,
      stdout,
      stderr,
      output_truncated: processResult.stdout.length > stdout.length || processResult.stderr.length > stderr.length
    };
    return {
      verification_type: this.verificationType,
      validator_ref: this.id,
      aggregate_result: accepted ? 'accepted' : 'rejected',
      confidence: 1,
      results: [{
        criterion_id: config.criterion_id ?? 'command-exit-zero',
        status: accepted ? 'passed' : 'failed',
        exit_code: processResult.code,
        timed_out: processResult.timedOut
      }],
      evidence_hash: createHash('sha256').update(canonicalJson(evidence)).digest('hex'),
      evidence
    };
  }
}
