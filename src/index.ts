import { defineCommand, runMain } from "citty";
import audit from "./commands/audit.js";
import config from "./commands/config.js";
import doctor from "./commands/doctor.js";
import info from "./commands/info.js";
import init from "./commands/init.js";
import install from "./commands/install.js";
import list from "./commands/list.js";
import remove from "./commands/remove.js";
import run from "./commands/run.js";
import search from "./commands/search.js";
import secrets from "./commands/secrets.js";
import sync from "./commands/sync.js";
import update from "./commands/update.js";
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
    config,
    search,
    info,
    run,
  },
});

runMain(main);
