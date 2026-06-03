import { writeMobileBundle } from "../mobile/src/bundle";

await writeMobileBundle(new URL("../mobile/dist", import.meta.url).pathname);
