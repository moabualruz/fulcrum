// /settings/data — server load: reads FULCRUM_FEATURES flags.
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    exportCsvEnabled: features.includes("export-csv"),
    importCsvEnabled: features.includes("import-csv"),
  };
};
