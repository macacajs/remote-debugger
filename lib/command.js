/* ================================================================
 * remote-debugger by xdf(xudafeng[at]126.com)
 *
 * first created at : Mon Feb 29 2016 23:02:22 GMT+0800 (CST)
 *
 * ================================================================
 * Copyright  xdf
 *
 * Licensed under the MIT License
 * You may not use this file except in compliance with the License.
 *
 * ================================================================ */

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
        'expression': this.options.command,
        'returnByValue': true
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
  }
  return command.execute();
}

module.exports = {
  createCommand
};
