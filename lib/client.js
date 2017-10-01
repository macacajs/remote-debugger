'use strict';

const WS = require('ws');

const _ = require('./helper');
const logger = require('./logger');
const createCommand = require('./command').createCommand;

class WebSocketClient {
  constructor(options) {
    this.protocol = options.protocol || 'http';
    this.host = options.host || 'localhost';
    this.port = options.port || 9222;
    this.connected = false;
    this.socket = null;
    this.count = 0;
    this.successCallbacks = {};
    this.failCallbacks = {};
  }

  isConnected() {
    return this.socket && this.connected;
  }

  connect(index) {
    const url = `ws://${this.host}:${this.port}/devtools/page/${index}`;
    this.socket = new WS(url);

    return new Promise((resolve, reject) => {
      this.socket.on('open', () => {
        logger.debug(`Remote debugger connected to websocket url: ${url}`);
        this.connected = true;
        resolve();
      });
      this.socket.on('close', () => {
        logger.debug(`Remote debugger websocket disconnected with url: ${url}`);
        this.connected = false;
      });
      this.socket.on('error', (e) => {
        if (this.connected) {
          logger.debug(`Remote debugger websocket error happened: ${e.message}`);
          this.connected = false;
        }
        reject(e);
      });
      this.socket.on('message', this.receive.bind(this));
    });
  }

  receive(data) {
    logger.debug(`Get result from websocket: ${_.truncate(data, {
      length: 400
    })}`);
    data = JSON.parse(data);
    const commandId = '' + data.id;
    const error = data.error;
    let result = data.result;

    if (commandId) {
      const successCallback = this.successCallbacks[commandId];
      const failCallback = this.failCallbacks[commandId];

      if (error) {
        return failCallback && failCallback(error);
      } else if (result && result.wasThrown) {
        const message = result.result.description;
        const failCallback = this.failCallbacks[commandId];
        return failCallback && failCallback(new Error(message));
      } else {

        if (!successCallback) {
          return;
        }

        result = result.result;

        if (!result) {
          return successCallback('');
        }

        if (result.type === 'string') {
          try {
            let value = JSON.parse(result.value);
            value = value.value;
            return successCallback(value);
          } catch (e) {
            console.log(e);
          }
        } else if (result.type === 'object') {
          return successCallback(result.value);
        } else {
          return successCallback('');
        }
      }
    }
  }

  disconnect() {
    if (this.isConnected()) {
      logger.debug('Disconnecting from Remote debugger');
      this.socket.close(1001);
      this.connected = false;
    }
  }

  send(cmd, options) {
    const command = createCommand(cmd, options);
    this.count++;
    command.id = this.count;
    const id = command.id.toString();
    return new Promise((resolve, reject) => {
      this.successCallbacks[id] = resolve;
      this.failCallbacks[id] = reject;
      const data = JSON.stringify(command);
      logger.debug(`Send command to websocket: ${_.truncate(data, {
        length: 400
      })}`);
      this.socket.send(data, err => {
        if (err) {
          return reject(err);
        }
      });
    });
  }
}

module.exports = WebSocketClient;
