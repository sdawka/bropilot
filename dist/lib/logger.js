"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.log = void 0;
const log = (message) => {
    console.log(message);
};
exports.log = log;
const error = (message) => {
    console.error(`Error: ${message}`);
};
exports.error = error;
