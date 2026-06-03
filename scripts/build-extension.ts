import { writeExtensionBundle } from "../extension/src/bundle";

await writeExtensionBundle(new URL("../extension/dist", import.meta.url).pathname);
