export type DocEmbedProvider =
  | "youtube"
  | "vimeo"
  | "figma"
  | "loom"
  | "codepen"
  | "github-gist"
  | "generic";

export interface DocEmbedDescriptor {
  provider: DocEmbedProvider;
  url: string;
  label: string;
  embeddableUrl: string;
}

const PROVIDERS: Array<{
  provider: DocEmbedProvider;
  label: string;
  hosts: string[];
  embed: (url: URL) => string;
}> = [
  {
    provider: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "youtu.be"],
    embed: (url) => {
      const videoId = url.hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url.toString();
    },
  },
  {
    provider: "vimeo",
    label: "Vimeo",
    hosts: ["vimeo.com", "www.vimeo.com"],
    embed: (url) => {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : url.toString();
    },
  },
  {
    provider: "figma",
    label: "Figma",
    hosts: ["figma.com", "www.figma.com"],
    embed: (url) => `https://www.figma.com/embed?embed_host=fulcrum&url=${encodeURIComponent(url.toString())}`,
  },
  {
    provider: "loom",
    label: "Loom",
    hosts: ["loom.com", "www.loom.com"],
    embed: (url) => url.toString().replace("/share/", "/embed/"),
  },
  {
    provider: "codepen",
    label: "CodePen",
    hosts: ["codepen.io", "www.codepen.io"],
    embed: (url) => url.toString().replace("/pen/", "/embed/"),
  },
  {
    provider: "github-gist",
    label: "GitHub Gist",
    hosts: ["gist.github.com"],
    embed: (url) => url.toString(),
  },
];

export function detectDocEmbedProvider(rawUrl: string): DocEmbedDescriptor {
  const fallback = rawUrl.trim();
  try {
    const url = new URL(fallback);
    const host = url.hostname.toLowerCase();
    const provider = PROVIDERS.find((candidate) => candidate.hosts.includes(host));
    if (!provider) {
      return {
        provider: "generic",
        url: url.toString(),
        label: "Embed",
        embeddableUrl: url.toString(),
      };
    }
    return {
      provider: provider.provider,
      url: url.toString(),
      label: provider.label,
      embeddableUrl: provider.embed(url),
    };
  } catch {
    return {
      provider: "generic",
      url: fallback,
      label: "Embed",
      embeddableUrl: fallback,
    };
  }
}
