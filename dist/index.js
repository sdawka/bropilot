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
exports.ProcessingEngine = exports.BropilotDatabase = exports.BropilotCLI = void 0;
const commander_1 = require("commander");
const package_json_1 = require("../package.json");
const logger_1 = require("./lib/logger");
const init_1 = require("./commands/init");
const chat_1 = require("./commands/chat");
const process_1 = require("./commands/process");
const tasks_1 = require("./commands/tasks");
const code_1 = require("./commands/code");
const status_1 = require("./commands/status");
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const program = new commander_1.Command();
        program
            .name('bro')
            .version(package_json_1.version)
            .description('A CLI for everything a bro needs');
        // Add commands
        program.addCommand(init_1.initCommand);
        // TODO: Fix command conflicts before re-enabling
        // program.addCommand(commitCommand);
        // program.addCommand(chatCommand);
        // program.addCommand(processCommand);
        // program.addCommand(tasksCommand);
        // program.addCommand(codeCommand);
        // program.addCommand(statusCommand);
        program.addCommand(chat_1.chatCommand);
        program.addCommand(process_1.processCommand);
        program.addCommand(tasks_1.tasksCommand);
        program.addCommand(code_1.codeCommand);
        program.addCommand(status_1.statusCommand);
        program.parse(process.argv);
    }
    catch (e) {
        (0, logger_1.error)(e.message);
        process.exit(1);
    }
});
main();
// Export the main classes for external use
var cli_1 = require("./cli");
Object.defineProperty(exports, "BropilotCLI", { enumerable: true, get: function () { return cli_1.BropilotCLI; } });
var database_1 = require("./lib/database");
Object.defineProperty(exports, "BropilotDatabase", { enumerable: true, get: function () { return database_1.BropilotDatabase; } });
var processor_1 = require("./lib/processor");
Object.defineProperty(exports, "ProcessingEngine", { enumerable: true, get: function () { return processor_1.ProcessingEngine; } });
