import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  DocumentCommentCreateBodyDto,
  DocumentCommentIdParamsDto,
  DocumentCommentPatchBodyDto,
  DocumentLinkCreateBodyDto,
  DocumentLinkIdParamsDto,
  DocumentVersionDiffQueryDto,
  DocumentVersionIdParamsDto,
  DocumentVersionParamsDto,
  DocumentCreateBodyDto,
  DocumentIdParamsDto,
  DocumentPatchBodyDto,
  DocumentPublicApiController,
  DocumentPublicApiModule,
  DocumentPublicApiService,
} from "@knowledge-workspace/interface/http/document-public-api.controller.ts";

const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINK_ID = "doc-link-1";

describe("document public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DocumentPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(DocumentPublicApiController);
    expect(appImports).toContain(DocumentPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController)).toBe("api/v1/docs");
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listDocuments)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.listDocuments)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.createDocument)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listTemplates)).toBe(
      "templates",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.resolveTemplate)).toBe(
      "templates/resolve",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.getDocument)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.patchDocument)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.deleteDocument)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listComments)).toBe(
      ":id/comments",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.createComment)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.patchComment)).toBe(
      "comments/:commentId",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.resolveComment)).toBe(
      "comments/:commentId/resolve",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.deleteComment)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listBacklinks)).toBe(
      ":id/backlinks",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listForwardLinks)).toBe(
      ":id/forward-links",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.createLink)).toBe("links");
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.createLink)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.deleteLink)).toBe(
      "links/:linkId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentPublicApiController.prototype.deleteLink)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.listVersions)).toBe(
      ":id/versions",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.diffVersions)).toBe(
      ":id/versions/diff",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.getVersion)).toBe(
      ":id/versions/:version",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.getVersionById)).toBe(
      ":id/version-ids/:versionId",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.diffVersionById)).toBe(
      ":id/version-ids/:versionId/diff",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.restoreVersion)).toBe(
      ":id/versions/:version/restore",
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentPublicApiController.prototype.restoreVersionById)).toBe(
      ":id/version-ids/:versionId/restore",
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new DocumentPublicApiController(new DocumentPublicApiService());

      await expect(controller.listDocuments({})).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new DocumentPublicApiController(new DocumentPublicApiService());

      await expect(controller.listDocuments({})).rejects.toBeInstanceOf(InternalServerErrorException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates document list and CRUD to the document application facade", async () => {
    const list = mock(async () => [{ id: DOC_ID, title: "Doc", docType: "note" }]);
    const create = mock(async () => ({ id: DOC_ID, title: "Doc", docType: "note" }));
    const get = mock(async () => ({ id: DOC_ID, title: "Doc", docType: "note" }));
    const update = mock(async () => ({ id: DOC_ID, title: "Updated", docType: "page" }));
    const remove = mock(async () => ({ id: DOC_ID }));
    const controller = new DocumentPublicApiController(
      new DocumentPublicApiService({
        featuresEnv: "public-api",
        application: { list, create, get, update, delete: remove },
      }),
    );

    await expect(controller.listDocuments({})).resolves.toEqual([
      expect.objectContaining({ id: DOC_ID, type: "note" }),
    ]);
    await expect(controller.createDocument({ title: "Doc", type: "note", bodyMd: "hello" })).resolves.toEqual(
      expect.objectContaining({ id: DOC_ID, type: "note" }),
    );
    await expect(controller.getDocument({ id: DOC_ID })).resolves.toEqual(expect.objectContaining({ id: DOC_ID }));
    await expect(controller.patchDocument({ id: DOC_ID }, { title: "Updated", type: "page" })).resolves.toEqual(
      expect.objectContaining({ title: "Updated", type: "page" }),
    );
    await expect(controller.deleteDocument({ id: DOC_ID })).resolves.toBeUndefined();

    expect(list).toHaveBeenCalledWith({});
    expect(create).toHaveBeenCalledWith({ title: "Doc", docType: "note", bodyMd: "hello" });
    expect(get).toHaveBeenCalledWith({ id: DOC_ID });
    expect(update).toHaveBeenCalledWith({ id: DOC_ID, title: "Updated", docType: "page", bodyMd: undefined });
    expect(remove).toHaveBeenCalledWith({ id: DOC_ID });
  });

  test("delegates comment and link operations to the document store", async () => {
    const store = {
      listComments: mock(async () => [{ id: COMMENT_ID, docId: DOC_ID, status: "open" }]),
      createComment: mock(async () => ({ id: COMMENT_ID, docId: DOC_ID, bodyMd: "note", status: "open" })),
      updateComment: mock(async () => ({ id: COMMENT_ID, bodyMd: "updated", status: "open" })),
      resolveComment: mock(async () => ({ id: COMMENT_ID, status: "resolved" })),
      deleteComment: mock(async () => ({ id: COMMENT_ID })),
      listBacklinks: mock(async () => [{ id: "link-1", targetDocId: DOC_ID }]),
      listForwardLinks: mock(async () => [{ id: "link-2", sourceDocId: DOC_ID }]),
      createLink: mock(async () => ({ id: LINK_ID, sourceDocId: DOC_ID, targetDocId: "target-doc" })),
      deleteLink: mock(async () => ({ id: LINK_ID })),
      listTemplates: mock(async () => [{ id: "template-1", type: "template" }]),
      resolveTemplate: mock(async () => ({ docType: "note", template: { id: "template-1" } })),
      listVersions: mock(async () => [{ id: "version-1", docId: DOC_ID, version: 1 }]),
      getVersion: mock(async () => ({ id: "version-1", docId: DOC_ID, version: 1 })),
      getVersionById: mock(async () => ({ id: "version-1", docId: DOC_ID, version: 1 })),
      diffVersions: mock(async () => ({ docId: DOC_ID, from: { version: 1 }, to: { version: 2 } })),
      diffVersionById: mock(async () => ({ docId: DOC_ID, versionId: "version-1", hasDiff: false })),
      restoreVersion: mock(async () => ({ id: DOC_ID, title: "Restored" })),
      restoreVersionById: mock(async () => ({ id: DOC_ID, title: "Restored by id" })),
    };
    const controller = new DocumentPublicApiController(
      new DocumentPublicApiService(
        { featuresEnv: "public-api" },
        store as unknown as ConstructorParameters<typeof DocumentPublicApiService>[1],
      ),
    );

    await expect(controller.listComments({ id: DOC_ID }, { resolved: "false" })).resolves.toEqual([
      expect.objectContaining({ id: COMMENT_ID, status: "open" }),
    ]);
    await expect(controller.createComment(
      { id: DOC_ID },
      { authorId: "user-1", bodyMd: "note", traceId: "trace-doc" },
    )).resolves.toEqual(expect.objectContaining({ id: COMMENT_ID }));
    await expect(controller.patchComment(
      { commentId: COMMENT_ID },
      { bodyMd: "updated" },
    )).resolves.toEqual(expect.objectContaining({ bodyMd: "updated" }));
    await expect(controller.resolveComment({ commentId: COMMENT_ID }, { resolved: true })).resolves.toEqual(
      expect.objectContaining({ status: "resolved" }),
    );
    await expect(controller.deleteComment({ commentId: COMMENT_ID })).resolves.toBeUndefined();
    await expect(controller.listBacklinks({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({ targetDocId: DOC_ID }),
    ]);
    await expect(controller.listForwardLinks({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({ sourceDocId: DOC_ID }),
    ]);
    await expect(controller.createLink({
      sourceDocId: DOC_ID,
      targetDocId: "target-doc",
      linkType: "wikilink",
      traceId: "trace-link",
    })).resolves.toEqual(expect.objectContaining({ id: LINK_ID }));
    await expect(controller.deleteLink({ linkId: LINK_ID })).resolves.toBeUndefined();
    await expect(controller.listTemplates({ projectId: "project-1" })).resolves.toEqual([
      expect.objectContaining({ id: "template-1", type: "template" }),
    ]);
    await expect(controller.resolveTemplate({ projectId: "project-1", docType: "note" })).resolves.toEqual(
      expect.objectContaining({ docType: "note", template: { id: "template-1" } }),
    );
    await expect(controller.listVersions({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({ docId: DOC_ID, version: 1 }),
    ]);
    await expect(controller.getVersion({ id: DOC_ID, version: "1" })).resolves.toEqual(
      expect.objectContaining({ docId: DOC_ID, version: 1 }),
    );
    await expect(controller.getVersionById({ id: DOC_ID, versionId: "version-1" })).resolves.toEqual(
      expect.objectContaining({ docId: DOC_ID, version: 1 }),
    );
    await expect(controller.diffVersions({ id: DOC_ID }, { fromVersion: "1", toVersion: "2" })).resolves.toEqual(
      expect.objectContaining({ docId: DOC_ID }),
    );
    await expect(controller.diffVersionById({ id: DOC_ID, versionId: "version-1" })).resolves.toEqual(
      expect.objectContaining({ docId: DOC_ID, versionId: "version-1" }),
    );
    await expect(controller.restoreVersion({ id: DOC_ID, version: "1" })).resolves.toEqual(
      expect.objectContaining({ id: DOC_ID, title: "Restored" }),
    );
    await expect(controller.restoreVersionById({ id: DOC_ID, versionId: "version-1" })).resolves.toEqual(
      expect.objectContaining({ id: DOC_ID, title: "Restored by id" }),
    );

    expect(store.listComments).toHaveBeenCalledWith({ docId: DOC_ID, resolved: "false" });
    expect(store.createComment).toHaveBeenCalledWith({
      docId: DOC_ID,
      authorId: "user-1",
      bodyMd: "note",
      parentCommentId: undefined,
      selection: undefined,
      traceId: "trace-doc",
    });
    expect(store.updateComment).toHaveBeenCalledWith({
      commentId: COMMENT_ID,
      bodyMd: "updated",
      selection: undefined,
      status: undefined,
    });
    expect(store.resolveComment).toHaveBeenCalledWith({ commentId: COMMENT_ID, resolved: true });
    expect(store.deleteComment).toHaveBeenCalledWith({ commentId: COMMENT_ID });
    expect(store.listBacklinks).toHaveBeenCalledWith({ docId: DOC_ID });
    expect(store.listForwardLinks).toHaveBeenCalledWith({ docId: DOC_ID });
    expect(store.createLink).toHaveBeenCalledWith({
      sourceDocId: DOC_ID,
      targetDocId: "target-doc",
      linkType: "wikilink",
      traceId: "trace-link",
    });
    expect(store.deleteLink).toHaveBeenCalledWith({ linkId: LINK_ID });
    expect(store.listTemplates).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(store.resolveTemplate).toHaveBeenCalledWith({ projectId: "project-1", docType: "note" });
    expect(store.listVersions).toHaveBeenCalledWith({ docId: DOC_ID });
    expect(store.getVersion).toHaveBeenCalledWith({ docId: DOC_ID, version: 1 });
    expect(store.getVersionById).toHaveBeenCalledWith({ docId: DOC_ID, versionId: "version-1" });
    expect(store.diffVersions).toHaveBeenCalledWith({ docId: DOC_ID, fromVersion: 1, toVersion: 2 });
    expect(store.diffVersionById).toHaveBeenCalledWith({ docId: DOC_ID, versionId: "version-1" });
    expect(store.restoreVersion).toHaveBeenCalledWith({ docId: DOC_ID, version: 1 });
    expect(store.restoreVersionById).toHaveBeenCalledWith({ docId: DOC_ID, versionId: "version-1" });
  });

  test("returns a Nest 404 when a document facade lookup returns nothing", async () => {
    const controller = new DocumentPublicApiController(
      new DocumentPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => null,
          get: async () => null,
          update: async () => null,
          delete: async () => null,
        },
      }),
    );

    await expect(controller.getDocument({ id: DOC_ID })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.patchDocument({ id: DOC_ID }, { title: "Updated" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.deleteDocument({ id: DOC_ID })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new DocumentIdParamsDto(), { id: DOC_ID });
    const invalidParams = Object.assign(new DocumentIdParamsDto(), { id: "not-a-uuid" });
    const commentParams = Object.assign(new DocumentCommentIdParamsDto(), { commentId: COMMENT_ID });
    const invalidCommentParams = Object.assign(new DocumentCommentIdParamsDto(), { commentId: "comment-1" });
    const body = Object.assign(new DocumentCreateBodyDto(), { title: "Doc", type: "note", bodyMd: "hello" });
    const invalidBody = Object.assign(new DocumentCreateBodyDto(), { title: "", type: "unknown" });
    const patch = Object.assign(new DocumentPatchBodyDto(), { title: "Updated", type: "page" });
    const invalidPatch = Object.assign(new DocumentPatchBodyDto(), { title: "", type: "unknown" });
    const commentBody = Object.assign(new DocumentCommentCreateBodyDto(), { authorId: "user-1", bodyMd: "note" });
    const invalidCommentBody = Object.assign(new DocumentCommentCreateBodyDto(), { authorId: "", bodyMd: "" });
    const commentPatch = Object.assign(new DocumentCommentPatchBodyDto(), { bodyMd: "updated", status: "open" });
    const linkParams = Object.assign(new DocumentLinkIdParamsDto(), { linkId: LINK_ID });
    const invalidLinkParams = Object.assign(new DocumentLinkIdParamsDto(), { linkId: "" });
    const linkBody = Object.assign(new DocumentLinkCreateBodyDto(), {
      sourceDocId: DOC_ID,
      targetDocId: "target-doc",
      linkType: "wikilink",
    });
    const invalidLinkBody = Object.assign(new DocumentLinkCreateBodyDto(), {
      sourceDocId: "",
      targetDocId: "",
      linkType: "",
    });
    const versionParams = Object.assign(new DocumentVersionParamsDto(), { id: DOC_ID, version: "1" });
    const versionIdParams = Object.assign(new DocumentVersionIdParamsDto(), { id: DOC_ID, versionId: "version-1" });
    const versionDiff = Object.assign(new DocumentVersionDiffQueryDto(), { fromVersion: "1", toVersion: "2" });
    const invalidVersionDiff = Object.assign(new DocumentVersionDiffQueryDto(), { fromVersion: "", toVersion: "" });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(commentParams)).toHaveLength(0);
    expect(validateSync(invalidCommentParams).map((error) => error.property)).toEqual(["commentId"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property)).toEqual(["title", "type"]);
    expect(validateSync(patch)).toHaveLength(0);
    expect(validateSync(invalidPatch).map((error) => error.property)).toEqual(["title", "type"]);
    expect(validateSync(commentBody)).toHaveLength(0);
    expect(validateSync(invalidCommentBody).map((error) => error.property)).toEqual(["authorId", "bodyMd"]);
    expect(validateSync(commentPatch)).toHaveLength(0);
    expect(validateSync(linkParams)).toHaveLength(0);
    expect(validateSync(invalidLinkParams).map((error) => error.property)).toEqual(["linkId"]);
    expect(validateSync(linkBody)).toHaveLength(0);
    expect(validateSync(invalidLinkBody).map((error) => error.property)).toEqual([
      "sourceDocId",
      "targetDocId",
      "linkType",
    ]);
    expect(validateSync(versionParams)).toHaveLength(0);
    expect(validateSync(versionIdParams)).toHaveLength(0);
    expect(validateSync(versionDiff)).toHaveLength(0);
    expect(validateSync(invalidVersionDiff).map((error) => error.property)).toEqual(["fromVersion", "toVersion"]);
  });
});
