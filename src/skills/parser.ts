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
  let frontmatter: Record<string, unknown> = {};
  try {
    const doc = YAML.parseDocument(frontmatterRaw, { prettyErrors: false });
    if (doc.errors.length > 0) {
      throw new Error(doc.errors[0].message);
    }
    frontmatter = (doc.toJSON() as Record<string, unknown>) ?? {};
  } catch {
    // Fallback: attempt to parse simple key: value lines for name/description.
    const simple: Record<string, string> = {};
    for (const line of frontmatterRaw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
      if (!match) {
        continue;
      }
      const key = match[1].toLowerCase();
      let value = match[2].trim();
      value = value.replace(/^['"]|['"]$/g, "");
      simple[key] = value;
    }
    frontmatter = simple;
  }

  const name =
    typeof frontmatter.name === "string" && frontmatter.name.trim()
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
