import { mergeModelCatalog, type ModelSpec } from "@content-agent/shared";
import type { DatabaseService } from "../database/database.module.js";

/** Built-in models plus the custom models an admin saved in the production settings. */
export async function loadModelCatalog(db: Pick<DatabaseService, "query">): Promise<ModelSpec[]> {
  const result = await db.query<{ value: { customModels?: ModelSpec[] } }>("SELECT value FROM system_settings WHERE key = 'production_settings'");
  return mergeModelCatalog(result.rows[0]?.value.customModels);
}
