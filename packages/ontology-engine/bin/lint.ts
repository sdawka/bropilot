/// <reference types="node" />
import { main } from "../src/adapters/artyfact/lint";

process.exitCode = main(process.argv.slice(2));
