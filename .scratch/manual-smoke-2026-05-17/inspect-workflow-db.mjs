import 'reflect-metadata';
import { initDataSource } from '../../services/platform-core/src/infrastructure/application-database/typeorm.config.ts';

const projectId = process.argv[2];
const ds = await initDataSource();
try {
  const tasks = await ds.query('select id,title,status,trace_id from fulcrum_tasks where project_id=$1 order by id', [projectId]);
  const deps = await ds.query('select id,task_id,depends_on_task_id,dependency_kind,trace_id from fulcrum_task_dependencies where project_id=$1 order by task_id,depends_on_task_id', [projectId]);
  console.log(JSON.stringify({projectId, tasks, deps}, null, 2));
} finally {
  await ds.destroy();
}
