import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveKeywordDir } from './downloadPaths.js';

export interface MergeNotesMarkdownInput {
  platform?: string;
  env: string;
  keyword: string;
  homeDir?: string;
  downloadRoot?: string;
  outputFileName?: string;
  noteFileCandidates?: string[];
  includeComments?: boolean;
  commentsFileName?: string;
}

export interface MergeNotesMarkdownOutput {
  success: boolean;
  keywordDir: string;
  outputPath: string;
  totalNotes: number;
  mergedNotes: number;
  skippedNotes: string[];
  error?: string;
}

function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_') || name.toLowerCase() === 'macosx';
}

async function pathExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

function rewriteRelativeImagePath(rawPath: string, noteId: string): string {
  const trimmed = String(rawPath || '').trim();
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(trimmed)) return rawPath;
  if (/^[a-z]+:/i.test(trimmed)) return rawPath;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return rawPath;
  const cleaned = trimmed.replace(/^\.?\//, '');
  return `./${noteId}/${cleaned}`;
}

function rewriteMarkdownImages(markdown: string, noteId: string): string {
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
  return markdown.replace(pattern, (_match, altText, rawPath, titlePart) => {
    const nextPath = rewriteRelativeImagePath(rawPath, noteId);
    const title = titlePart || '';
    return `![${altText}](${nextPath}${title})`;
  });
}

export async function mergeNotesMarkdown(input: MergeNotesMarkdownInput): Promise<MergeNotesMarkdownOutput> {
  const {
    platform = 'xiaohongshu',
    env,
    keyword,
    homeDir,
    downloadRoot,
    outputFileName = 'merged.md',
    noteFileCandidates = ['content.md', 'README.md'],
    includeComments = true,
    commentsFileName = 'comments.md',
  } = input;

  const keywordDir = resolveKeywordDir({ platform, env, keyword, homeDir, downloadRoot });
  const outputPath = path.join(keywordDir, outputFileName);

  if (!(await pathExists(keywordDir))) {
    return {
      success: false,
      keywordDir,
      outputPath,
      totalNotes: 0,
      mergedNotes: 0,
      skippedNotes: [],
      error: `keyword_dir_missing: ${keywordDir}`,
    };
  }

  const entries = await fs.readdir(keywordDir, { withFileTypes: true }).catch((): any[] => []);
  const noteDirs = entries.filter((ent) => ent?.isDirectory?.() && !shouldSkipDir(ent.name));

  const sections: string[] = [];
  const skippedNotes: string[] = [];

  for (const ent of noteDirs) {
    const noteId = ent.name;
    let contentPath = '';
    for (const candidate of noteFileCandidates) {
      const candidatePath = path.join(keywordDir, noteId, candidate);
      if (await pathExists(candidatePath)) {
        contentPath = candidatePath;
        break;
      }
    }

    if (!contentPath) {
      skippedNotes.push(noteId);
      continue;
    }

    const raw = await fs.readFile(contentPath, 'utf-8').catch(() => '');
    const content = rewriteMarkdownImages(raw, noteId).trim();

    const lines: string[] = [];
    lines.push(`## ${noteId}`);
    lines.push('');
    if (content) {
      lines.push(content);
    }

    if (includeComments) {
      const commentsPath = path.join(keywordDir, noteId, commentsFileName);
      if (await pathExists(commentsPath)) {
        const commentsRaw = await fs.readFile(commentsPath, 'utf-8').catch(() => '');
        const comments = commentsRaw.trim();
        if (comments) {
          lines.push('');
          lines.push('### Comments');
          lines.push('');
          lines.push(comments);
        }
      }
    }

    sections.push(lines.join('\n'));
  }

  const header: string[] = [];
  header.push(`# ${keyword}`);
  header.push('');
  header.push(`- keyword: ${keyword}`);
  header.push(`- generatedAt: ${new Date().toISOString()}`);
  header.push(`- notes: ${sections.length}`);
  header.push('');

  const merged = header.join('\n') + (sections.length > 0 ? sections.join('\n\n---\n\n') : '');
  await fs.writeFile(outputPath, merged, 'utf-8');

  return {
    success: true,
    keywordDir,
    outputPath,
    totalNotes: noteDirs.length,
    mergedNotes: sections.length,
    skippedNotes,
  };
}
