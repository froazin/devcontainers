/** The entrypoint GitHub Actions runs. The logic is in main.js, so the tests can import it without running it. */

import { runAction } from "../lib.js";
import { run } from "./main.js";

await runAction("Prepare the code review", () => run());
