import { execFile } from 'node:child_process';

const ALLOWED_COMMANDS = /^[a-zA-Z0-9._-]+$/;

export function which(command: string): Promise<string | null> {
  if (!ALLOWED_COMMANDS.test(command)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    execFile('which', [command], (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}
