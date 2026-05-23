import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  InferenceClassifyRequestDto,
  InferenceConfigSetRequestDto,
  InferenceEmbedRequestDto,
  InferenceGenerateRequestDto,
  InferenceModelParamsDto,
  InferencePublicApiController,
  InferencePublicApiModule,
  InferencePublicApiService,
  InferenceTextRequestDto,
} from "@platform-core/interface/http/inference-public-api.controller.ts";

describe("inference public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InferencePublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(InferencePublicApiController);
    expect(appImports).toContain(InferencePublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, InferencePublicApiController)).toBe("api/v1/inference");
    expect(Reflect.getMetadata(METHOD_METADATA, InferencePublicApiController.prototype.health)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, InferencePublicApiController.prototype.embed)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, InferencePublicApiController.prototype.listModels)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, InferencePublicApiController.prototype.removeModel)).toBe(RequestMethod.DELETE);
  });

  test("hides routes when the public API feature is off", async () => {
    const controller = new InferencePublicApiController(new InferencePublicApiService({ featuresEnv: "" }));

    await expect(controller.health()).rejects.toBeInstanceOf(NotFoundException);
  });

  test("delegates inference operations to the application port", async () => {
    async function* progress() {
      yield { type: "download_progress" as const, pct: 100, downloaded: 4, total: 4 };
    }
    const application = {
      health: mock(async () => ({ status: "ok", backends: ["embedded"], models: ["mini"] })),
      embed: mock(async () => ({ vectors: [[1, 2]], model: "mini", cached: false, dimensions: 2 })),
      generate: mock(async () => ({ text: "done", model: "mini", tokens: 1 })),
      classify: mock(async () => [{ label: "bug", score: 0.9 }]),
      tokenize: mock(async () => ({ count: 1, tokens: ["hello"] })),
      listModels: mock(async () => [{ id: "mini", kind: "embed" as const, downloaded: true, active: true }]),
      pullModel: mock(() => progress()),
      rmModel: mock(async () => ({ ok: true })),
      listBackends: mock(async () => [{ id: "embedded" as const, available: true, active: true, reason: null }]),
    };
    const controller = new InferencePublicApiController(
      new InferencePublicApiService({ featuresEnv: "public-api", application }),
    );

    await expect(controller.health()).resolves.toMatchObject({ status: "ok" });
    await expect(controller.embed({ texts: ["hello"], model: "mini" })).resolves.toMatchObject({ dimensions: 2 });
    await expect(controller.generate({ prompt: "hello", model: "mini", maxTokens: 12 })).resolves.toMatchObject({
      text: "done",
    });
    await expect(controller.classify({ text: "bug", labels: ["bug", "feature"] })).resolves.toEqual([
      { label: "bug", score: 0.9 },
    ]);
    await expect(controller.tokenize({ text: "hello", model: "mini" })).resolves.toEqual({
      count: 1,
      tokens: ["hello"],
    });
    await expect(controller.listModels()).resolves.toEqual([
      { id: "mini", kind: "embed", downloaded: true, active: true },
    ]);
    await expect(controller.pullModel({ modelId: "mini" }, { force: true })).resolves.toEqual([
      { type: "download_progress", pct: 100, downloaded: 4, total: 4 },
    ]);
    await expect(controller.removeModel({ modelId: "mini" })).resolves.toEqual({ ok: true });
    await expect(controller.listBackends()).resolves.toEqual([
      { id: "embedded", available: true, active: true, reason: null },
    ]);

    expect(application.embed).toHaveBeenCalledWith(["hello"], { model: "mini" });
    expect(application.generate).toHaveBeenCalledWith("hello", { model: "mini", maxTokens: 12 });
    expect(application.classify).toHaveBeenCalledWith("bug", ["bug", "feature"]);
    expect(application.tokenize).toHaveBeenCalledWith("hello", "mini");
    expect(application.pullModel).toHaveBeenCalledWith("mini", { force: true });
  });

  test("manages routing config and provider settings at the API boundary", async () => {
    const previousUrl = process.env["FULCRUM_INFERENCE_URL"];
    const previousKey = process.env["FULCRUM_INFERENCE_API_KEY"];
    try {
      const controller = new InferencePublicApiController(
        new InferencePublicApiService({ featuresEnv: "public-api" }),
      );

      await expect(controller.getConfig()).resolves.toMatchObject({ embeddings: "embedded" });
      await expect(controller.setConfig({ feature: "embeddings", backend: "ollama" })).resolves.toMatchObject({
        ok: true,
        config: { embeddings: "ollama" },
      });
      await expect(controller.setProvider({ url: "https://llm.local", key: "secret" })).resolves.toEqual({
        ok: true,
        url: "https://llm.local",
        credentialRef: {
          kind: "env",
          name: "FULCRUM_INFERENCE_API_KEY",
          redacted: true,
        },
      });
      expect(process.env["FULCRUM_INFERENCE_URL"]).toBe("https://llm.local");
      expect(process.env["FULCRUM_INFERENCE_API_KEY"]).toBe("secret");
    } finally {
      restoreEnv("FULCRUM_INFERENCE_URL", previousUrl);
      restoreEnv("FULCRUM_INFERENCE_API_KEY", previousKey);
    }
  });

  test("keeps request validation at the Nest boundary", () => {
    const embed = Object.assign(new InferenceEmbedRequestDto(), { texts: ["hello"], model: "mini" });
    const invalidEmbed = Object.assign(new InferenceEmbedRequestDto(), { texts: [] });
    const generate = Object.assign(new InferenceGenerateRequestDto(), {
      prompt: "hello",
      maxTokens: 12,
      temperature: 0.2,
    });
    const classify = Object.assign(new InferenceClassifyRequestDto(), {
      text: "bug",
      labels: ["bug", "feature"],
    });
    const text = Object.assign(new InferenceTextRequestDto(), { text: "hello", model: "mini" });
    const params = Object.assign(new InferenceModelParamsDto(), { modelId: "mini" });
    const config = Object.assign(new InferenceConfigSetRequestDto(), {
      feature: "embeddings",
      backend: "embedded",
    });

    expect(validateSync(embed)).toEqual([]);
    expect(validateSync(invalidEmbed).map((error) => error.property)).toEqual(["texts"]);
    expect(validateSync(generate)).toEqual([]);
    expect(validateSync(classify)).toEqual([]);
    expect(validateSync(text)).toEqual([]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(config)).toEqual([]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
