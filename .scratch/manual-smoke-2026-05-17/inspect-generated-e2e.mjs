import 'reflect-metadata';
import { initDataSource } from '../../services/platform-core/src/infrastructure/application-database/typeorm.config.ts';
const projectId = process.argv[2];
const traceId = process.argv[3];
const ds = await initDataSource();
try {
  const rows = await ds.query('select id,project_id,trace_id,runner,status,file_path from fulcrum_generated_e2e_tests where project_id=$1 or trace_id=$2 order by created_at,id', [projectId, traceId]);
  const uat = await ds.query('select id,project_id,trace_id,status from fulcrum_uat_sessions where project_id=$1 or trace_id=$2 order by created_at,id', [projectId, traceId]);
  const events = await ds.query("select id,mutation_type,trace_id from fulcrum_run_events where trace_id=$1 order by sequence,id", [traceId]);
  console.log(JSON.stringify({projectId, traceId, rows, uat, events}, null, 2));
} finally { await ds.destroy(); }
