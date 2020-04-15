'use strict';

const iOSUtils = require('ios-utils');
const request = require('request-promise');
const { exec } = require('child_process');
const getAtom = require('selenium-atoms').getByName;
const WebkitProxy = require('node-ios-webkit-debug-proxy');

const logger = require('./logger');
const WebSocketClient = require('./client');

const SIMULATOR = 'SIMULATOR';

// https://regex101.com/r/MEL55t/1
const WEBINSPECTOR_SOCKET_REGEXP = /\s+(\S+com\.apple\.webinspectord_sim\.socket)/;

const getWebInspectorSocket = deviceId =>
  new Promise(resolve => {
    let webInspectorSocket = null;
    // lsof -aUc launchd_sim
    // gives a set of records like:
    //   launchd_s 69760 isaac    3u  unix 0x57aa4fceea3937f3      0t0      /private/tmp/com.apple.CoreSimulator.SimDevice.D7082A5C-34B5-475C-994E-A21534423B9E/syslogsock
    //   launchd_s 69760 isaac    5u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
    //   launchd_s 69760 isaac    6u  unix 0x57aa4fceea39372b      0t0      ->0x57aa4fceea3937f3
    //   launchd_s 69760 isaac    8u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
    //   launchd_s 69760 isaac    9u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
    //   launchd_s 69760 isaac   10u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
    //   launchd_s 69760 isaac   11u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
    //   launchd_s 69760 isaac   12u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
    // these _appear_ to always be grouped together (so, the records for the particular sim are all in a group, before the next sim, etc.)
    // so starting from the correct UDID, we ought to be able to pull the next record with `com.apple.webinspectord_sim.socket` to get the correct socket
    exec('lsof -aUc launchd_sim', (err, stdout) => {
      if (err) {
        resolve(null);
      } else {
        for (let record of stdout.split('com.apple.CoreSimulator.SimDevice.')) {
          if (!record.includes(deviceId)) {
            continue;
          }
          const match = WEBINSPECTOR_SOCKET_REGEXP.exec(record);
          if (match) {
            webInspectorSocket = match[1];
          }
        }
        resolve(webInspectorSocket);
      }
    });
  });

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
    let args = [];
    if (!info.isRealIOS) {
      const webInspectorSocket = yield getWebInspectorSocket(this.deviceId);
      if (webInspectorSocket) {
        // gives UNIX:PATH like ['-s', 'unix:/private/tmp/com.apple.launchd.qrNVQWYPGs/com.apple.webinspectord_sim.socket'] to connect simulator web inspector
        // get more information via ios_webkit_debug_proxy --help
        args = ['-s', `unix:${webInspectorSocket}`];
      }
      this.deviceId = SIMULATOR;
    }
    this.proxy = new WebkitProxy();
    yield this.proxy.start(args);
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
