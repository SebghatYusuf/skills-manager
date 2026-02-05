import fs from "fs/promises";
import path from "path";
import YAML from "yaml";
import { SkillRecord, TokenEstimate } from "../shared/types";

export interface ParsedSkillFile {
  name: string;
  description: string;
  body: string;
  fullText: string;
}

const FRONTMATTER_DELIM = "---";

export async function parseSkillFile(skillPath: string): Promise<ParsedSkillFile> {
  const content = await fs.readFile(skillPath, "utf8");
  const trimmed = content.trimStart();

  if (!trimmed.startsWith(FRONTMATTER_DELIM)) {
    const name = path.basename(path.dirname(skillPath));
    return {
      name,
      description: "",
      body: content,
      fullText: content,
    };
  }

  const lines = content.split(/\r?\n/);
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONTMATTER_DELIM) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    const name = path.basename(path.dirname(skillPath));
    return {
      name,
      description: "",
      body: content,
      fullText: content,
    };
  }

  const frontmatterRaw = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n");
  const frontmatter = YAML.parse(frontmatterRaw) ?? {};

  const name = typeof frontmatter.name === "string" && frontmatter.name.trim()
    ? frontmatter.name.trim()
    : path.basename(path.dirname(skillPath));
  const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";

  return {
    name,
    description,
    body,
    fullText: content,
  };
}

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.ceil(normalized.length / 4);
}

export function estimateSkillTokens(parsed: ParsedSkillFile): TokenEstimate {
  const metaText = [parsed.name, parsed.description].filter(Boolean).join("\n");
  const metadataTokens = estimateTokens(metaText);
  const fullTokens = estimateTokens(parsed.fullText);
  return {
    metadata: metadataTokens,
    full: fullTokens,
  };
}

export async function loadSkillRecord(skillFilePath: string): Promise<SkillRecord> {
  const parsed = await parseSkillFile(skillFilePath);
  const tokens = estimateSkillTokens(parsed);
  return {
    id: skillFilePath,
    name: parsed.name,
    description: parsed.description,
    path: path.dirname(skillFilePath),
    sourceRoots: [],
    tokens,
  };
}
