// Vitest global setup for packages/monitor.
//
// HIGH-9: the bypass_auth config flag requires env FULCRUM_MONITOR_ALLOW_BYPASS=1
// as a double-confirmation so production deployments can't silently disable
// auth via a config-file boolean. Every monitor test that passes
// { bypass_auth: true } to startMonitorServer needs the env side of the gate
// too; this setup file sets it once for the whole test run.
process.env['FULCRUM_MONITOR_ALLOW_BYPASS'] = '1'
