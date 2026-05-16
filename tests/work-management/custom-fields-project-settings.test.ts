import { describe, expect, it } from "bun:test";

import {
  archiveCustomField,
  createCustomField,
  listCustomFields,
  updateCustomField,
} from "@work-management/application/custom-fields/project-settings.ts";
import { createTestOrm } from "@test-support/application-database.ts";

describe("custom field project settings application service", () => {
  it("creates, lists, updates, archives, and emits events against the current custom_field_defs schema", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const projectId = "22222222-2222-4222-8222-222222222222";
      await em.getConnection().execute(
        `insert into projects (id, org_id, name, workflow_config, methodology, enabled_task_types)
         values ('${projectId}', '${db.seed.orgId}', 'Field settings project', '{}'::jsonb, 'kanban', '[]'::jsonb)`,
      );

      const first = await createCustomField(em, {
        orgId: db.seed.orgId,
        projectId,
        name: "Customer Tier",
        fieldType: "select",
        required: true,
        options: ["gold", "silver"],
      });
      const second = await createCustomField(em, {
        orgId: db.seed.orgId,
        projectId,
        name: "Estimate",
        fieldType: "number",
      });

      expect(await listCustomFields(em, projectId)).toMatchObject([
        {
          id: first.id,
          name: "Customer Tier",
          field_type: "select",
          required: true,
          options: ["gold", "silver"],
          sort_order: 0,
          archived: false,
        },
        {
          id: second.id,
          name: "Estimate",
          field_type: "number",
          required: false,
          options: [],
          sort_order: 1,
          archived: false,
        },
      ]);

      await updateCustomField(em, {
        id: first.id,
        name: "Customer segment",
        required: false,
        options: ["enterprise", "startup"],
        sortOrder: 3,
      });

      const updated = await listCustomFields(em, projectId);
      expect(updated.find((field) => field.id === first.id)).toMatchObject({
        name: "Customer segment",
        required: false,
        options: ["enterprise", "startup"],
        sort_order: 3,
      });

      await archiveCustomField(em, first.id);
      expect((await listCustomFields(em, projectId)).map((field) => field.id)).toEqual([second.id]);
      expect((await listCustomFields(em, projectId, true)).map((field) => field.id).sort()).toEqual([first.id, second.id].sort());

      const events = await em.getConnection().execute<Array<{ verb: string; subject_id: string }>>(
        `select verb, subject_id from events where subject_kind = 'custom_field' order by created_at asc`,
      );
      expect(events).toEqual([
        { verb: "created", subject_id: first.id },
        { verb: "created", subject_id: second.id },
        { verb: "updated", subject_id: first.id },
        { verb: "archived", subject_id: first.id },
      ]);
    } finally {
      await db.close();
    }
  });

  it("rejects invalid field types, empty updates, and missing records before mutating data", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await expect(createCustomField(em, {
        orgId: db.seed.orgId,
        projectId: "22222222-2222-4222-8222-222222222222",
        name: "Bad",
        fieldType: "bogus" as never,
      })).rejects.toThrow("invalid field_type bogus");
      await expect(updateCustomField(em, { id: "22222222-2222-4222-8222-222222222222" })).rejects.toThrow("no fields to update");
      await expect(updateCustomField(em, { id: "22222222-2222-4222-8222-222222222222", name: "Missing" })).rejects.toThrow("not found");
      await expect(archiveCustomField(em, "22222222-2222-4222-8222-222222222222")).rejects.toThrow("not found");
    } finally {
      await db.close();
    }
  });
});
