// src/errors.ts - MVP 统一错误体系

export class MvpError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MvpError';
  }
}

export class ConnectionError extends MvpError {
  constructor(message: string) {
    super(message, 'CDP_CONNECTION');
    this.name = 'ConnectionError';
  }
}

export class SelectorResolutionError extends MvpError {
  constructor(path: string, tried: string[]) {
    super(`Selector resolution failed for "${path}". Tried: ${tried.join(', ')}`, 'SELECTOR_FAILED');
    this.name = 'SelectorResolutionError';
  }
}

export class TaskSwitchError extends MvpError {
  constructor(taskIndex: number, reason: string) {
    super(`Task switch failed for slot ${taskIndex}: ${reason}`, 'TASK_SWITCH');
    this.name = 'TaskSwitchError';
  }
}

export class FillPromptError extends MvpError {
  constructor(reason: string) {
    super(`Prompt fill failed: ${reason}`, 'FILL_PROMPT');
    this.name = 'FillPromptError';
  }
}

export class SubmitError extends MvpError {
  constructor(reason: string) {
    super(`Submit failed: ${reason}`, 'SUBMIT');
    this.name = 'SubmitError';
  }
}

export class ResponseTimeoutError extends MvpError {
  constructor(timeoutMs: number) {
    super(`Response timeout after ${timeoutMs}ms`, 'RESPONSE_TIMEOUT');
    this.name = 'ResponseTimeoutError';
  }
}
