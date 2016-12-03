'use strict';

class Command {
  constructor(options) {
    this.options = options;
  }

  execute() {
    throw new Error('Not implemented');
  }
}

class SendJSCommand extends Command {
  constructor(options) {
    super(options);
    this.method = 'Runtime.evaluate';
  }

  execute() {
    return {
      method: this.method,
      params: {
        expression: this.options.command,
        returnByValue: true
      }
    };
  }
}

class NavigateCommand extends Command {
  constructor(options) {
    super(options);
    this.method = 'Page.navigate';
  }

  execute() {
    return {
      method: this.method,
      params: {
        url: this.options.command
      }
    };
  }
}

function createCommand(cmd, options) {
  let command;
  switch (cmd) {
    case 'sendJSCommand':
      command = new SendJSCommand(options);
      break;
    case 'navigateCommand':
      command = new NavigateCommand(options);
      break;
  }
  return command.execute();
}

module.exports = {
  createCommand
};
