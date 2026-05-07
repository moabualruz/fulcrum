export const FULCRUM_RULES_BEGIN = "<!-- BEGIN FULCRUM RULES -->";
export const FULCRUM_RULES_END = "<!-- END FULCRUM RULES -->";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceSentinelBlock(source: string, body: string): string {
  const beginCount = (source.match(new RegExp(escapeRegExp(FULCRUM_RULES_BEGIN), "g")) ?? []).length;
  const endCount = (source.match(new RegExp(escapeRegExp(FULCRUM_RULES_END), "g")) ?? []).length;
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`expected exactly one Fulcrum sentinel block, found ${beginCount}/${endCount}`);
  }
  const begin = source.indexOf(FULCRUM_RULES_BEGIN);
  const end = source.indexOf(FULCRUM_RULES_END, begin);
  if (end === -1 || end < begin) {
    throw new Error("invalid Fulcrum sentinel order");
  }
  const afterEnd = end + FULCRUM_RULES_END.length;
  return `${source.slice(0, begin)}${FULCRUM_RULES_BEGIN}\n${body.trimEnd()}\n${FULCRUM_RULES_END}${source.slice(afterEnd)}`;
}
