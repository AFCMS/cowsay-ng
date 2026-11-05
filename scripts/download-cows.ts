// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import snapshot from "./cows-snapshot.json" with { type: "json" };
import { generateCows } from "./generate-cows.ts";

interface Download {
  name: string;
  data: Buffer;
}

/**
 * Downloads one pinned file and verifies its Git blob hash before returning its contents.
 */
async function downloadFile(ref: string, path: string, expectedHash: string): Promise<Download> {
  const url = `https://raw.githubusercontent.com/${snapshot.repository}/${ref}/${path}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "cowsay-ng" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${path}: HTTP ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");

  if (actualHash !== expectedHash) {
    throw new Error(`Integrity check failed: ${path}; no files were written`);
  }

  return { name: path.split("/").at(-1)!, data };
}

/**
 * Verifies the entire pinned download before replacing artwork or generating entry points.
 */
async function main(): Promise<void> {
  const ref = process.argv[2] ?? snapshot.commit;
  if (ref !== snapshot.commit) {
    throw new Error(
      "To change the artwork snapshot, review and update scripts/cows-snapshot.json first.",
    );
  }

  const entries = Object.entries(snapshot.files);
  const downloads: Download[] = [];

  for (let offset = 0; offset < entries.length; offset += 8) {
    const entriesInBatch = entries.slice(offset, offset + 8);
    const batch = await Promise.all(
      entriesInBatch.map(([path, hash]) => downloadFile(ref, path, hash)),
    );
    downloads.push(...batch);
  }

  for (const { name, data } of downloads) {
    const destination = new URL(`../src/cows/${name}`, import.meta.url);
    await writeFile(destination, data);
  }

  await generateCows();
  console.log(
    `Verified ${entries.length} artwork and notice files at ${snapshot.commit}; generated lazy cow modules and catalog.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
