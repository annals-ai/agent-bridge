import { execFile } from 'node:child_process';

export function which(command: string): Promise<string | null> {
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
