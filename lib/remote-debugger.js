'use strict';

const iOSUtils = require('ios-utils');
const request = require('request-promise');
const getAtom = require('selenium-atoms').getByName;
const WebkitProxy = require('node-ios-webkit-debug-proxy');

const logger = require('./logger');
const WebSocketClient = require('./client');

const SIMULATOR = 'SIMULATOR';

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
    const info = iOSUtils.getDeviceInfo(this.deviceId);

    if (!info.isRealIOS) {
      this.deviceId = SIMULATOR;
    }
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
          logger.debug(`Device: ${this.deviceId} does not exist.`);
          this.port = this.devicesPort;
          return;
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

  sendCommand(atom, args, frames) {
    if (!this.isConnected()) {
      Promise.reject(new Error('Remote debugger websocket is not connected'));
    }
    let atomScript = getAtom(atom);
    let script;
    if (frames.length) {
      let elem = getAtom('get_element_from_cache');
      let frame = frames[0];
      script = `(function (window) { var document = window.document;
        return (${atomScript}); })((${elem.toString('utf8')})(${JSON.stringify(frame)}))`;
    } else {
      script = `(${atomScript})`;
    }

    return this.client.send('sendJSCommand', {
      command: `${script}(${args.map(JSON.stringify).join(',')})`
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

RemoteDebugger.SIMULATOR = SIMULATOR;

module.exports = RemoteDebugger;
