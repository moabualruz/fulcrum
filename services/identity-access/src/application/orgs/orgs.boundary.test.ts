import { describe, expect, test } from "bun:test";

import { removeOrgMember, updateOrg, updateOrgMemberRole } from "@identity-access/application/orgs/commands.ts";
import { getOrg, listOrgMembers } from "@identity-access/application/orgs/queries.ts";

describe("org application boundary", () => {
  test("exports command and query entrypoints for tRPC delegation", () => {
    expect(getOrg).toBeFunction();
    expect(listOrgMembers).toBeFunction();
    expect(removeOrgMember).toBeFunction();
    expect(updateOrg).toBeFunction();
    expect(updateOrgMemberRole).toBeFunction();
  });
});
