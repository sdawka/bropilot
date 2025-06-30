"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitCommand = void 0;
const commander_1 = require("commander");
exports.commitCommand = new commander_1.Command()
    .name('commit')
    .description('Create a new commit')
    .action(() => {
    console.log('Commit command is not implemented yet');
});
