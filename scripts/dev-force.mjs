import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PORT = 3000;

function getPidsUsingPort(port) {
  const platform = os.platform();

  if (platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();

      const pids = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => /LISTENING/i.test(line))
        .map((line) => line.split(/\s+/).pop())
        .filter(Boolean)
        .map((pid) => Number.parseInt(pid, 10))
        .filter((pid) => Number.isFinite(pid));

      return [...new Set(pids)];
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -t -i tcp:${port}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();

    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((pid) => Number.parseInt(pid, 10))
      .filter((pid) => Number.isFinite(pid));

    return [...new Set(pids)];
  } catch {
    return [];
  }
}

function killPid(pid) {
  const platform = os.platform();

  if (platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    return;
  }

  process.kill(pid, 'SIGKILL');
}

function cleanupPort(port) {
  const pids = getPidsUsingPort(port);
  if (pids.length === 0) {
    console.log(`No process is listening on port ${port}`);
    return;
  }

  for (const pid of pids) {
    try {
      killPid(pid);
      console.log(`Stopped process ${pid} on port ${port}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to stop process ${pid}: ${message}`);
    }
  }
}

function startVite() {
  const viteBin = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--port', String(PORT), '--host', '0.0.0.0'], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

cleanupPort(PORT);
startVite();
