/* ================================================================
 * remote-debugger by xdf(xudafeng[at]126.com)
 *
 * first created at : Wed Mar 02 2016 17:06:53 GMT+0800 (CST)
 *
 * ================================================================
 * Copyright  xdf
 *
 * Licensed under the MIT License
 * You may not use this file except in compliance with the License.
 *
 * ================================================================ */

'use strict';

const request = require('request-promise');
const getAtom = require('selenium-atoms').getByName;
const WebkitProxy = require('node-ios-webkit-debug-proxy');

const logger = require('./logger');
const WebSocketClient = require('./client');

class RemoteDebugger {
  constructor(options) {
    this.protocol = 'http';
    this.host = 'localhost';
    this.devicesPort = 9221;
    this.port = null;
    this.client = null;
    this.proxy = null;
    this.deviceId = null;
    Object.assign(this, {
    }, options || {});
  }

  *start() {
    this.proxy = new WebkitProxy();
    yield this.proxy.start();
    yield this.configurePort();
  }

  configurePort() {
    const infoUrl = `${this.protocol}://${this.host}:${this.devicesPort}/json`;
    return request
      .get(infoUrl)
      .then(JSON.parse)
      .then(devices => {
        const urls = devices
          .filter(device => device.deviceId === this.deviceId)
          .map(device => device.url);
        if (!urls.length) {
          throw new Error(`Device: ${this.deviceId} does not exist.`);
        }
        const deviceUrl = urls[0];
        const devicePort = deviceUrl.split(':')[1];
        this.port = devicePort;
        logger.debug(`Configure port: ${devicePort} for deviceId: ${this.deviceId}`);
        return devicePort;
      });
  }

  stop() {
    this.proxy.stop();
  }

  getPages() {
    const url = `${this.protocol}://${this.host}:${this.port}/json`;
    logger.debug(`Getting pages from url: ${url}`);

    return request
      .get(url)
      .then(JSON.parse)
      .then(pages => {
        return pages
        .filter(page => !!page.url)
        .map(page => {
          const id = page.webSocketDebuggerUrl.split('/').pop();
          return {
            id,
            title: page.title,
            url: page.url
          };
        });
      });
  }

  isConnected() {
    return this.client && this.client.isConnected();
  }

  connect(index) {
    this.client = new WebSocketClient({
      host: this.host,
      port: this.port
    });
    return this.client.connect(index);
  }

  disconnect() {
    if (this.isConnected()) {
      this.client.disconnect();
    }
  }

  sendCommand(atom, args) {
    if (!this.isConnected()) {
      Promise.reject(new Error('Remote debugger websocket is not connected'));
    }
    return this.client.send('sendJSCommand', {
      command: `(${getAtom(atom)})(${args.map(JSON.stringify).join(',')})`
    });
  }

  navigateTo(url) {
    if (!this.isConnected()) {
      Promise.reject(new Error('Remote debugger websocket is not connected'));
    }
    return this.client.send('navigateCommand', {
      command: url
    });
  }
}

RemoteDebugger.SIMULATOR = 'SIMULATOR';

module.exports = RemoteDebugger;
