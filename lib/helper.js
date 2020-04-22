'use strict';

const util = require('xutil');
const logger = require('./logger');

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitUntil = (func, isOk, options = { retryTime: 10, ms: 1000 }) => {
  let retryTime = 0;
  const p = () =>
    Promise.resolve(func()).then((res) => {
      if (!isOk(res)) {
        if (retryTime === options.retryTime) {
          return res;
        }
        retryTime++;
        logger.debug(`retrying... (${retryTime} retries left)`);
        return sleep(options.ms).then(p);
      }
      return res;
    });
  return p();
};

const _ = util.merge({ waitUntil, sleep }, util);

module.exports = _;
