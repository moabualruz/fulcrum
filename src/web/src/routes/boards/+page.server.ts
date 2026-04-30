import { groupTasksByStatus, listBoardTasks } from "$lib/product-queries";

export async function load() {
  const tasks = await listBoardTasks();
  return { groups: groupTasksByStatus(tasks) };
}
