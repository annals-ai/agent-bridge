const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(msg: string, ...args: unknown[]) {
    console.log(`${GRAY}${timestamp()}${RESET} ${BLUE}INFO${RESET}  ${msg}`, ...args);
  },
  success(msg: string, ...args: unknown[]) {
    console.log(`${GRAY}${timestamp()}${RESET} ${GREEN}OK${RESET}    ${msg}`, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    console.warn(`${GRAY}${timestamp()}${RESET} ${YELLOW}WARN${RESET}  ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    console.error(`${GRAY}${timestamp()}${RESET} ${RED}ERROR${RESET} ${msg}`, ...args);
  },
  debug(msg: string, ...args: unknown[]) {
    if (process.env.DEBUG) {
      console.log(`${GRAY}${timestamp()} DEBUG ${msg}${RESET}`, ...args);
    }
  },
  banner(text: string) {
    console.log(`\n${BOLD}${text}${RESET}\n`);
  },
};
