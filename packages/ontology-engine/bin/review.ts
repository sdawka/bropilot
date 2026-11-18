/// <reference types="node" />
import { main } from "../src/adapters/artyfact/review-cli";

process.exitCode = await main(process.argv.slice(2));
