import type { RuleDefinition } from "../utils/types.js";
import { rules as batchA } from "./batch-a.js";
import { rules as batchB } from "./batch-b.js";
import { rules as batchC } from "./batch-c.js";
import { rules as batchD } from "./batch-d.js";
import { rules as batchE } from "./batch-e.js";

export const ruleDefinitions: RuleDefinition[] = [
  ...batchA,
  ...batchB,
  ...batchC,
  ...batchD,
  ...batchE,
].sort((left, right) => left.name.localeCompare(right.name));
