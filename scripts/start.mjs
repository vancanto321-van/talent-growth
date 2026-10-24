#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(projectRoot, 'talent-growth');
const previewScript = path.join(appRoot, 'scripts', 'preview-journey.mjs');
const syncScript = path.join(appRoot, 'server', 'growth-sync.mjs');
const dataDir = path.join(projectRoot, '.local-data', 'growth-sync');
const lockPath = path.join(projectRoot, '.local-data', 'growth-sync.lock');
const nodeMajor = Number(process.versions.node.split('.')[0]);

if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  console.error(`Node.js 22 or newer is required to run the local launcher (found ${process.versions.node}).`);
  process.exitCode = 1;
  process.exit();
}

function parsePort(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port (1-65535); received ${JSON.stringify(raw)}`);
  }
  return value;
}

function printUsage() {
  console.log('Usage: node scripts/start.mjs [--port PORT] [--api-port PORT]');
  console.log('       npm start -- [--port PORT] [--api-port PORT]');
  console.log('Starts the local preview at http://127.0.0.1:PORT/growth/.');
}

function parseArgs(args) {
  const options = { help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-h' || argument === '--help') {
      options.help = true;
      continue;
    }
    let name;
    let value;
    if (argument === '--port' || argument === '--api-port') {
      name = argument;
      value = args[++index];
      if (value === undefined || value.startsWith('-')) throw new Error(`${name} requires a port value. Use --help for usage.`);
    } else if (argument.startsWith('--port=') || argument.startsWith('--api-port=')) {
      const separator = argument.indexOf('=');
      name = argument.slice(0, separator);
      value = argument.slice(separator + 1);
      if (!value) throw new Error(`${name} requires a port value. Use --help for usage.`);
    } else {
      throw new Error(`Unknown option ${argument}. Use --help for usage.`);
    }
    if (name === '--port') options.port = parsePort(value, '--port');
    else options.apiPort = parsePort(value, '--api-port');
  }
  return options;
}

let cliOptions;
try {
  cliOptions = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Local preview failed to start: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}
if (cliOptions.help) {
  printUsage();
  process.exit(0);
}

function configuredPort(...entries) {
  for (const [raw, name] of entries) {
    if (raw !== undefined && raw !== '') return parsePort(raw, name);
  }
  return undefined;
}

const previewPort = configuredPort(
  [cliOptions.port, '--port'],
  [process.env.PORT, 'PORT'],
  [process.env.GROWTH_PREVIEW_PORT, 'GROWTH_PREVIEW_PORT'],
) ?? 4184;
const syncPort = configuredPort(
  [cliOptions.apiPort, '--api-port'],
  [process.env.GROWTH_SYNC_PORT, 'GROWTH_SYNC_PORT'],
  [process.env.GROWTH_PREVIEW_API_PORT, 'GROWTH_PREVIEW_API_PORT'],
) ?? 18139;

function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    const fail = error => {
      probe.close();
      if (error?.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use; choose another port with ${port === previewPort ? 'PORT' : 'GROWTH_SYNC_PORT'}.`));
      } else {
        reject(new Error(`Cannot use port ${port}: ${error?.message || error}`));
      }
    };
    probe.once('error', fail);
    probe.listen({ host: '127.0.0.1', port }, () => probe.close(error => error ? fail(error) : resolve()));
  });
}

function spawnService(label, script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: appRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const prefix = `[${label}]`;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`${prefix} ${chunk}`));
  return child;
}

function waitForReady(child, label, matcher) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';
    const timeout = setTimeout(() => finish(new Error(`${label} did not become ready within 15 seconds.`)), 15_000);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('close', onClose);
      error ? reject(error) : resolve();
    };
    const onData = chunk => {
      output += chunk;
      if (matcher.test(output)) finish();
    };
    const onError = error => finish(new Error(`${label} failed to start: ${error.message}`));
    const onClose = (code, signal) => {
      if (!settled) {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        finish(new Error(`${label} stopped before becoming ready (${reason}).`));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
    child.once('close', onClose);
  });
}

let preview;
let sync;
let stopping = false;
let exitCode = 0;
let shutdownPromise;
let runtimeStopResolve;
let lockHandle;
let lockOwned = false;

function acquireDataLock(origin) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, origin }) + '\n', 'utf8');
    lockHandle = handle;
    lockOwned = true;
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* Keep the original error. */ }
      try { fs.unlinkSync(lockPath); } catch { /* Keep the original error. */ }
    }
    if (error?.code === 'EEXIST') {
      throw new Error(`Local backup data is already locked at ${lockPath}. If the previous service is stopped, remove that lock file and try again.`);
    }
    throw new Error(`Cannot create local backup data lock at ${lockPath}: ${error.message}`);
  }
}

function releaseDataLock() {
  if (!lockOwned) return;
  lockOwned = false;
  try { fs.closeSync(lockHandle); } catch { /* The descriptor may already be closed. */ }
  try { fs.unlinkSync(lockPath); } catch { /* Preserve shutdown result if cleanup is unavailable. */ }
  lockHandle = undefined;
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 3_000).unref();
}

async function shutdown(code = exitCode) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  shutdownPromise = (async () => {
    stopChild(preview);
    stopChild(sync);
    await Promise.all([preview, sync].filter(Boolean).map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else {
        child.once('close', resolve);
        child.once('error', resolve);
      }
    })));
    releaseDataLock();
    process.exitCode = code;
  })();
  return shutdownPromise;
}

const onSignal = () => {
  exitCode = 130;
  runtimeStopResolve?.();
  void shutdown(130);
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

async function main() {
  if (stopping) return;
  const origin = `http://127.0.0.1:${previewPort}`;
  acquireDataLock(origin);
  if (stopping) {
    releaseDataLock();
    return;
  }
  if (previewPort === syncPort) throw new Error(`Preview and backup services cannot share port ${previewPort}.`);
  await Promise.all([portAvailable(previewPort), portAvailable(syncPort)]);
  if (stopping) return;

  sync = spawnService('backup', syncScript, {
    GROWTH_SYNC_HOST: '127.0.0.1',
    GROWTH_SYNC_PORT: String(syncPort),
    GROWTH_SYNC_DIR: dataDir,
    GROWTH_SYNC_DEV: '1',
    COOKIE_SECURE: '0',
    GROWTH_SYNC_ORIGIN: origin,
    GROWTH_SYNC_ALLOWED_ORIGIN: origin,
  });
  preview = spawnService('preview', previewScript, {
    GROWTH_PREVIEW_PORT: String(previewPort),
    GROWTH_PREVIEW_API_PORT: String(syncPort),
  });

  sync.once('close', () => {
    if (!stopping) {
      exitCode = 1;
      runtimeStopResolve?.();
      void shutdown(1);
    }
  });
  preview.once('close', () => {
    if (!stopping) {
      exitCode = 1;
      runtimeStopResolve?.();
      void shutdown(1);
    }
  });

  await Promise.all([
    waitForReady(sync, 'Backup service', /growth-sync listening on 127\.0\.0\.1:/),
    waitForReady(preview, 'Journey preview', /Journey preview: http:\/\/127\.0\.0\.1:/),
  ]);
  if (stopping) return;
  console.log(`Local preview ready: ${origin}/growth/`);
  await new Promise(resolve => { runtimeStopResolve = resolve; });
  await shutdown(0);
}

main().catch(async error => {
  console.error(`Local preview failed to start: ${error.message}`);
  exitCode = 1;
  await shutdown(1);
});
