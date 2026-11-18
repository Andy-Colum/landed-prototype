import { parseResume } from "../backend/ai.js";
import { aiHandler } from "./_handler.js";
export default aiHandler(parseResume);
