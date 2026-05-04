/**
 * Re-export from product-kernel so web server code can import via $lib alias.
 */
export {
  isFeatureEnabled,
  parseFeatures,
  loadFeatures,
  getFeatureBackend,
  type FeatureFlag,
} from "../../../../product-kernel/features.ts";
