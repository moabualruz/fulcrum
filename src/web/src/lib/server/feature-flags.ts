/**
 * Re-export from kernel compatibility so web server code can import via $lib alias.
 */
export {
  isFeatureEnabled,
  parseFeatures,
  loadFeatures,
  getFeatureBackend,
  type FeatureFlag,
} from "./application-compat";
