import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";

export const runtime = "nodejs";

export interface ManualChapter {
  id: string;
  title: string;
  body: string;
}

export async function GET(request: NextRequest) {
  try {
    await requireMobileSession(request);
    const manualPath = path.join(process.cwd(), "docs", "huong-dan-su-dung", "HUONG-DAN-SU-DUNG-HIMOTO.md");
    const raw = await readFile(manualPath, "utf8");
    const sections = raw.split(/\r?\n(?=## \d+\. )/);
    const chapters: ManualChapter[] = [];
    for (const section of sections) {
      const match = /^## (\d+\. [^\r\n]+)\r?\n([\s\S]*)$/.exec(section.trim());
      if (!match) continue;
      chapters.push({
        id: match[1].split(".")[0].trim(),
        title: match[1].trim(),
        body: match[2].trim(),
      });
    }
    return mobileJson({ chapters });
  } catch (error) {
    return mobileFailure(error);
  }
}
