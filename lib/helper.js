'use strict';

const util = require('xutil');
const logger = require('./logger');

const waitUntil = async (func, isOk, options = { retryTime: 10, ms: 1000 }) => {
  let retryTime = 0;
  const p = async () => {
    const res = await func();
    if (!isOk(res)) {
      if (retryTime === options.retryTime) {
        return res;
      }
      retryTime++;
      logger.debug(`retrying... (${retryTime} retries left)`);
      await sleep(options.ms);
      return await p();
    }
    return res;
  };
  return await p();
};

const _ = util.merge({ waitUntil }, util);

module.exports = _;
