import { defineCommand, runMain } from "citty";
import audit from "./commands/audit.js";
import completions from "./commands/completions.js";
import config from "./commands/config.js";
import create from "./commands/create.js";
import doctor from "./commands/doctor.js";
import exportCmd from "./commands/export-command.js";
import importCmd from "./commands/import-command.js";
import info from "./commands/info.js";
import init from "./commands/init.js";
import install from "./commands/install.js";
import link from "./commands/link.js";
import list from "./commands/list.js";
import logs from "./commands/logs.js";
import plugin from "./commands/plugin.js";
import profiles from "./commands/profiles.js";
import registry from "./commands/registry.js";
import remove from "./commands/remove.js";
import run from "./commands/run.js";
import search from "./commands/search.js";
import secrets from "./commands/secrets.js";
import sync from "./commands/sync.js";
import testCmd from "./commands/test-command.js";
import update from "./commands/update.js";
import upgrade from "./commands/upgrade.js";
import watch from "./commands/watch.js";
import why from "./commands/why.js";
import { APP_DESCRIPTION, APP_NAME, APP_VERSION } from "./utils/constants.js";

process.on("SIGINT", () => {
  console.log("\nAborted.");
  process.exit(130);
});

const main = defineCommand({
  meta: {
    name: APP_NAME,
    version: APP_VERSION,
    description: APP_DESCRIPTION,
  },
  subCommands: {
    install,
    list,
    remove,
    doctor,
    init,
    secrets,
    sync,
    audit,
    update,
    upgrade,
    config,
    search,
    info,
    run,
    logs,
    test: testCmd,
    profiles,
    plugin,
    export: exportCmd,
    import: importCmd,
    create,
    link,
    watch,
    registry,
    completions,
    why,
  },
});

runMain(main);
