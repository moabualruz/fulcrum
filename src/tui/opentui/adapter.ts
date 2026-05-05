import {
  createCliRenderer,
  TextRenderable,
  type CliRenderer,
  type TextOptions,
} from "@opentui/core";
import type { TuiOutput } from "../testing/fake-tty.ts";

export interface FulcrumTuiRenderer {
  render(content: string): void;
  writeStatus(status: string): void;
  dispose(): void | Promise<void>;
}

export interface FulcrumTuiRendererOptions {
  testMode?: boolean;
  output?: TuiOutput;
}

function createNullOutput(): TuiOutput {
  return {
    isTTY: false,
    columns: 80,
    rows: 24,
    write: () => {},
  };
}

function createTestRenderer(output: TuiOutput): FulcrumTuiRenderer {
  return {
    render(content: string): void {
      output.write(`${content}\n`);
    },
    writeStatus(status: string): void {
      output.write(`status: ${status}\n`);
    },
    dispose(): void {
      output.write("");
    },
  };
}

function addText(renderer: CliRenderer, options: TextOptions): TextRenderable {
  const text = new TextRenderable(renderer, options);
  renderer.root.add(text);
  return text;
}

export async function createFulcrumTuiRenderer(
  options: FulcrumTuiRendererOptions = {},
): Promise<FulcrumTuiRenderer> {
  if (options.testMode) {
    return createTestRenderer(options.output ?? createNullOutput());
  }

  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    useMouse: true,
    exitOnCtrlC: true,
    targetFps: 30,
  });

  const main = addText(renderer, {
    id: "fulcrum-main",
    content: "",
    width: "100%",
  });
  const status = addText(renderer, {
    id: "fulcrum-status",
    content: "",
    width: "100%",
  });

  return {
    render(content: string): void {
      main.content = content;
      renderer.requestRender();
    },
    writeStatus(nextStatus: string): void {
      status.content = nextStatus;
      renderer.requestRender();
    },
    dispose(): void {
      renderer.stop();
      renderer.destroy();
    },
  };
}
