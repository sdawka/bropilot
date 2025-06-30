#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const package_json_1 = require("../package.json");
const logger_1 = require("./lib/logger");
const init_1 = require("./commands/init");
const commit_1 = require("./commands/commit");
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const program = new commander_1.Command();
        program
            .name('bro')
            .version(package_json_1.version)
            .description('A CLI for everything a bro needs');
        // Add commands
        program.addCommand(init_1.initCommand);
        program.addCommand(commit_1.commitCommand);
        program.parse(process.argv);
    }
    catch (e) {
        (0, logger_1.error)(e.message);
        process.exit(1);
    }
});
main();
