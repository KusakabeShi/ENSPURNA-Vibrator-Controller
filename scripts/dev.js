#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

const frontendArgs = process.argv.slice(2);
const children = new Map();
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
      shutdown(exitCode);
    }
  });
  child.on('error', (error) => {
    console.error(`[dev] Failed to start ${name}:`, error);
    shutdown(1);
  });
  return child;
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
  // Give children a little time to exit gracefully before quitting ourselves.
  setTimeout(() => {
    process.exit(code);
  }, 100);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal === 'SIGINT' ? 130 : 143, signal));
}

start('backend', 'python3', [
  'signalling_server_builtin.py',
  '--host',
  '0.0.0.0',
  '--port',
  '5174',
]);

start('frontend', 'vite', frontendArgs);
