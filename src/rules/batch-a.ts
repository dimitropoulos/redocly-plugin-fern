import type { RuleDefinition } from "../utils/types.js";
import { noGetRequestBody } from "./no-get-request-body.js";

export const rules: RuleDefinition[] = [noGetRequestBody];
