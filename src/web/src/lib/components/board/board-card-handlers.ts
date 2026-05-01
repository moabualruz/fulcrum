export function makeBoardCardClick(
  taskId: string,
  onEdit?: (id: string) => void,
): () => void {
  return () => onEdit?.(taskId);
}
