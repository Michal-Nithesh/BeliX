/**
 * Test Setup
 * Global test configuration and utilities
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-token';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Suppress logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Global test timeout
jest.setTimeout(10000);

// Helper function for creating mock repositories
global.createMockRepository = () => ({
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  executeQuery: jest.fn(async (fn) => fn()),
});

// Helper for creating mock logger
global.createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

// Helper for creating mock cache
global.createMockCache = () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true),
  delete: jest.fn(async () => true),
  deletePattern: jest.fn(async () => true),
  clear: jest.fn(async () => true),
});

// Helper for creating mock Discord client
global.createMockDiscordClient = () => ({
  on: jest.fn(),
  emit: jest.fn(),
  login: jest.fn(async () => {}),
  destroy: jest.fn(async () => {}),
  user: { id: 'bot-id', tag: 'BeliX#0000' },
  guilds: { cache: { size: 1 } },
});

// Helper for creating mock interaction
global.createMockInteraction = (overrides = {}) => ({
  commandName: 'test-command',
  user: { id: 'test-user', username: 'TestUser', tag: 'TestUser#0000' },
  guildId: 'test-guild',
  channelId: 'test-channel',
  reply: jest.fn(async (options) => options),
  deferReply: jest.fn(async () => {}),
  editReply: jest.fn(async (options) => options),
  followUp: jest.fn(async (options) => options),
  ...overrides,
});
