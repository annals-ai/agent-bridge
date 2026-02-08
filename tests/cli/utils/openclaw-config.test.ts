import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { readOpenClawToken, readOpenClawConfig, isChatCompletionsEnabled } from '../../../packages/cli/src/utils/openclaw-config.js';

vi.mock('node:fs');
vi.mock('../../../packages/cli/src/utils/logger.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('readOpenClawToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read token from valid config', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: {
        auth: {
          token: 'abc123def456789012345678901234567890123456789012'
        }
      }
    }));

    const token = readOpenClawToken('/fake/path');
    expect(token).toBe('abc123def456789012345678901234567890123456789012');
  });

  it('should return null when file does not exist', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const token = readOpenClawToken('/fake/path');
    expect(token).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    vi.mocked(readFileSync).mockReturnValue('not json');

    const token = readOpenClawToken('/fake/path');
    expect(token).toBeNull();
  });

  it('should return null when token field is missing', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: { auth: {} }
    }));

    const token = readOpenClawToken('/fake/path');
    expect(token).toBeNull();
  });

  it('should return null when token is empty string', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: { auth: { token: '' } }
    }));

    const token = readOpenClawToken('/fake/path');
    expect(token).toBeNull();
  });
});

describe('readOpenClawConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read and return valid config object', () => {
    const configObj = {
      gateway: {
        auth: { token: 'test-token' },
        http: { endpoints: { chatCompletions: { enabled: true } } }
      }
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configObj));

    const config = readOpenClawConfig('/fake/path');
    expect(config).toEqual(configObj);
  });

  it('should return null when file does not exist', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const config = readOpenClawConfig('/fake/path');
    expect(config).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    vi.mocked(readFileSync).mockReturnValue('not valid json {{{');

    const config = readOpenClawConfig('/fake/path');
    expect(config).toBeNull();
  });
});

describe('isChatCompletionsEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when chatCompletions is enabled', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: {
        http: {
          endpoints: {
            chatCompletions: { enabled: true }
          }
        }
      }
    }));

    expect(isChatCompletionsEnabled('/fake/path')).toBe(true);
  });

  it('should return false when chatCompletions config is missing', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: { auth: { token: 'test' } }
    }));

    expect(isChatCompletionsEnabled('/fake/path')).toBe(false);
  });

  it('should return false when enabled is explicitly false', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      gateway: {
        http: {
          endpoints: {
            chatCompletions: { enabled: false }
          }
        }
      }
    }));

    expect(isChatCompletionsEnabled('/fake/path')).toBe(false);
  });

  it('should return false when config file does not exist', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(isChatCompletionsEnabled('/fake/path')).toBe(false);
  });
});
