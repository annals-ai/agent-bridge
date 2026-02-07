import { program } from 'commander';
import { registerConnectCommand } from './commands/connect.js';
import { registerLoginCommand } from './commands/login.js';
import { registerStatusCommand } from './commands/status.js';

program
  .name('agent-bridge')
  .description('Connect local AI agents to the Skills.Hot platform')
  .version('0.1.0');

registerConnectCommand(program);
registerLoginCommand(program);
registerStatusCommand(program);

program.parse();
