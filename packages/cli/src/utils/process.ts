import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface SpawnResult {
  child: ChildProcess;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  kill: () => void;
}

export function spawnAgent(
  command: string,
  args: string[],
  options?: SpawnOptions
): SpawnResult {
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });

  return {
    child,
    stdout: child.stdout!,
    stderr: child.stderr!,
    stdin: child.stdin!,
    kill() {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    },
  };
}
